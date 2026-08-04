import { diContainer } from '@fastify/awilix'
import type { PrismaClient, Workflow } from '@mudkipme/klinklang-prisma'
import { asValue } from 'awilix'
import type { Job, Queue } from 'bullmq'
import { deepEqual, equal, ok, rejects } from 'node:assert/strict'
import { test } from 'node:test'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import { ActionWorker } from '../src/actions/base.ts'
import type { ActionJobData, ActionJobResult } from '../src/actions/interfaces.ts'
import { processAction } from '../src/actions/register.ts'
import { requestOutputSchema, type RequestAction, type RequestActionOutput } from '../src/actions/request.ts'
import type { Config } from '../src/lib/config.ts'
import { getTimerDelay, MAX_TIMER_DELAY_MS } from '../src/lib/cron.ts'
import { buildTopicWorkflowMap } from '../src/lib/eventbus.ts'
import { parsePagination } from '../src/lib/pagination.ts'
import { isValidJSONPath } from '../src/lib/workflow-runtime-validation.ts'
import { validateWorkflowCreatePayload } from '../src/lib/workflow-validation.ts'
import { outputUser } from '../src/models/user.ts'
import WorkflowInstance, { type WorkflowInstanceData } from '../src/models/workflow-instance.ts'
import { canViewWorkflow } from '../src/models/workflow.ts'
import { FediverseService } from '../src/services/fediverse.ts'

class RedisMock {
  readonly data = new Map<string, string>()
  readonly expirations: Array<{ key: string; seconds: number }> = []
  readonly ranges: Array<{ key: string; start: number; stop: number }> = []

  async set (key: string, value: string, _mode?: string, seconds?: number): Promise<'OK'> {
    await Promise.resolve()
    this.data.set(key, value)
    if (seconds !== undefined) {
      this.expirations.push({ key, seconds })
    }
    return 'OK'
  }

  async get (key: string): Promise<string | null> {
    await Promise.resolve()
    return this.data.get(key) ?? null
  }

  async zadd (): Promise<number> {
    await Promise.resolve()
    this.data.set('__sorted-set__', '1')
    return 1
  }

  async zremrangebyscore (): Promise<number> {
    await Promise.resolve()
    this.data.set('__score-prune__', '1')
    return 0
  }

  async zremrangebyrank (): Promise<number> {
    await Promise.resolve()
    this.data.set('__rank-prune__', '1')
    return 0
  }

  async expire (key: string, seconds: number): Promise<number> {
    await Promise.resolve()
    this.expirations.push({ key, seconds })
    return 1
  }

  async zrevrange (key: string, start: number, stop: number): Promise<string[]> {
    await Promise.resolve()
    this.ranges.push({ key, start, stop })
    return []
  }
}

class SuccessfulRequestWorker extends ActionWorker<RequestAction> {
  public process (): RequestActionOutput {
    return {
      statusCode: 200,
      headers: {},
      body: this.input.url
    }
  }
}

void test('public user output strips nested Fediverse credentials defensively', () => {
  const user = {
    id: 'user-id',
    name: 'Test user',
    wikiId: 42n,
    groups: ['bot'],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    fediAccounts: [{
      id: 'account-id',
      subject: '@test@example.com',
      accessToken: 'must-not-leak'
    }]
  }

  const output = outputUser(user)

  deepEqual(output.fediAccounts, [{ id: 'account-id', subject: '@test@example.com' }])
  equal(JSON.stringify(output).includes('must-not-leak'), false)
})

void test('cron timer delay is capped at the Node timer limit', () => {
  equal(getTimerDelay(1_000), 1_000)
  equal(getTimerDelay(MAX_TIMER_DELAY_MS + 1), MAX_TIMER_DELAY_MS)
})

void test('pagination uses bounded limit semantics', () => {
  deepEqual(parsePagination({}), { offset: 0, limit: 20 })
  deepEqual(parsePagination({ offset: '10', limit: '1' }), { offset: 10, limit: 1 })
  deepEqual(parsePagination({ offset: 'invalid', limit: '999999' }), { offset: 0, limit: 200 })
  deepEqual(parsePagination({ offset: '-1', limit: '0' }), { offset: 0, limit: 1 })
})

void test('workflow validation rejects invalid predicates and JSONPath expressions', () => {
  const invalidPredicate = validateWorkflowCreatePayload({
    name: 'Invalid predicate',
    isPrivate: false,
    enabled: true,
    triggers: [{
      type: 'TRIGGER_EVENTBUS',
      topic: 'revisions',
      predicate: { op: 'matches', path: '/title', value: '[' }
    }],
    definition: {
      StartAt: 'Done',
      States: { Done: { Type: 'Succeed' } }
    }
  })
  equal(invalidPredicate.data, null)
  ok(invalidPredicate.issues.some(issue => issue.includes('invalid regular expression')))

  const invalidPath = validateWorkflowCreatePayload({
    name: 'Invalid path',
    isPrivate: false,
    enabled: true,
    triggers: [],
    definition: {
      StartAt: 'Request',
      States: {
        Request: {
          Type: 'Task',
          Resource: 'REQUEST',
          InputPath: '$[',
          Parameters: { 'url.$': '$[' },
          End: true
        }
      }
    }
  })
  equal(isValidJSONPath('$['), false)
  equal(invalidPath.data, null)
  ok(invalidPath.issues.some(issue => issue.includes('invalid JSONPath expression')))

  const invalidActionInput = validateWorkflowCreatePayload({
    name: 'Invalid request',
    isPrivate: false,
    enabled: true,
    triggers: [],
    definition: {
      StartAt: 'Request',
      States: {
        Request: {
          Type: 'Task',
          Resource: 'REQUEST',
          Parameters: { method: 'GET', url: 'not-a-url' },
          End: true
        }
      }
    }
  })
  equal(invalidActionInput.data, null)
  ok(invalidActionInput.issues.some(issue => issue.includes('States.Request.Parameters.url')))
})

void test('action schemas reject invalid runtime inputs before worker execution', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- construct the minimal Job surface read by processAction
  const job = {
    id: 'invalid-job',
    data: {
      actionType: 'REQUEST',
      input: { method: 'GET', url: 'not-a-url' },
      workflowId: 'workflow-id',
      instanceId: 'instance-id',
      stateName: 'Request'
    }
  } as Job<ActionJobData<RequestAction>, ActionJobResult<RequestAction>>

  await rejects(processAction(job))
})

void test('private workflow visibility is restricted to its owner', () => {
  equal(canViewWorkflow({ isPrivate: false, userId: null }, 'other-user'), true)
  equal(canViewWorkflow({ isPrivate: true, userId: 'owner' }, 'owner'), true)
  equal(canViewWorkflow({ isPrivate: true, userId: 'owner' }, 'other-user'), false)
  equal(canViewWorkflow({ isPrivate: true, userId: null }), false)
})

void test('event-bus subscriptions deduplicate workflows without dropping later entries', () => {
  const first = {
    id: 'first',
    triggers: [
      { type: 'TRIGGER_EVENTBUS', topic: 'revisions' },
      { type: 'TRIGGER_EVENTBUS', topic: 'revisions' }
    ]
  } as unknown as Workflow
  const second = {
    id: 'second',
    triggers: [{ type: 'TRIGGER_EVENTBUS', topic: 'revisions' }]
  } as unknown as Workflow

  const topics = buildTopicWorkflowMap([first, second])

  deepEqual(topics.get('revisions')?.map(workflow => workflow.id), ['first', 'second'])
})

void test('Fediverse revocation checks ownership before external side effects', async () => {
  let lookupWhere: unknown = null
  const prisma = {
    fediAccount: {
      findFirst: async (args: { where: unknown }) => {
        await Promise.resolve()
        lookupWhere = args.where
        return null
      }
    }
  }
  const service = new FediverseService({
    prisma: prisma as unknown as PrismaClient,
    config: {} as unknown as Config,
    logger: {} as unknown as Logger
  })

  await service.revoke('owner-id', 'account-id')

  deepEqual(lookupWhere, { id: 'account-id', userId: 'owner-id' })
})

void test('workflow instance is persisted before enqueue and remains failed at a Fail state', async () => {
  const workflowId = '00000000-0000-4000-8000-000000000001'
  const workflow: Workflow = {
    id: workflowId,
    name: 'Failure workflow',
    isPrivate: false,
    enabled: true,
    triggers: [],
    definition: {
      StartAt: 'Start',
      States: {
        Start: {
          Type: 'Task',
          Resource: 'REQUEST',
          Next: 'Failure'
        },
        Failure: {
          Type: 'Fail',
          Error: 'EXPECTED_FAILURE'
        }
      }
    },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    userId: null
  }
  const redis = new RedisMock()
  let persistedBeforeEnqueue = false
  let definitionLookupCount = 0
  const queue = {
    add: async (_name: string, data: ActionJobData<RequestAction>, options: { jobId: string }) => {
      await Promise.resolve()
      persistedBeforeEnqueue = redis.data.has(`workflow-instance:${workflowId}:${data.instanceId}`)
      return { id: options.jobId }
    }
  }
  const prisma = {
    workflow: {
      findUnique: async () => {
        await Promise.resolve()
        definitionLookupCount += 1
        return workflow
      }
    }
  }
  const config = {
    get: (key: string) => {
      if (key === 'workflow') {
        return { instanceRetentionSeconds: 3600, instanceHistoryLimit: 100 }
      }
      throw new Error(`Unexpected config key: ${key}`)
    }
  }

  diContainer.register({
    config: asValue(config as unknown as Config),
    redis: asValue(redis as unknown as Redis),
    queue: asValue(queue as unknown as Queue),
    prisma: asValue(prisma as unknown as PrismaClient)
  })

  const instance = await WorkflowInstance.create(workflow)
  ok(persistedBeforeEnqueue)
  const initiallySaved = await redis.get(`workflow-instance:${workflowId}:${instance.instanceId}`)
  ok(initiallySaved !== null)
  ok('definition' in (JSON.parse(initiallySaved) as Record<string, unknown>))
  equal(JSON.stringify(instance).includes('definition'), false)

  // The worker only reads id and data; using a complete BullMQ Job would require a live queue.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- construct the minimal Job surface read by ActionWorker
  const job = {
    id: instance.firstJobId,
    data: {
      actionType: 'REQUEST',
      input: { method: 'GET', url: 'https://example.test' },
      workflowId,
      instanceId: instance.instanceId,
      stateName: 'Start'
    }
  } as Job<ActionJobData<RequestAction>, ActionJobResult<RequestAction>>
  await new SuccessfulRequestWorker(job).handleJob(requestOutputSchema)

  const saved = await redis.get(`workflow-instance:${workflowId}:${instance.instanceId}`)
  ok(saved !== null)
  const data = JSON.parse(saved) as WorkflowInstanceData
  equal(data.status, 'failed')
  equal(definitionLookupCount, 0)
  ok(redis.expirations.some(entry => entry.seconds === 3600))

  await WorkflowInstance.getInstancesOfWorkflow(workflowId, 10, 20)
  deepEqual(redis.ranges.at(-1), {
    key: `workflow-instances:${workflowId}`,
    start: 10,
    stop: 29
  })
})
