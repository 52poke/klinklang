import { diContainer } from '@fastify/awilix'
import type { PrismaClient, Workflow } from '@mudkipme/klinklang-prisma'
import { asValue } from 'awilix'
import type { Job, Queue } from 'bullmq'
import { deepEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import { ActionWorker } from '../src/actions/base.ts'
import type { ActionJobData, ActionJobResult } from '../src/actions/interfaces.ts'
import type { RequestAction, RequestActionOutput } from '../src/actions/request.ts'
import type { Config } from '../src/lib/config.ts'
import { getTimerDelay, MAX_TIMER_DELAY_MS } from '../src/lib/cron.ts'
import { outputUser } from '../src/models/user.ts'
import WorkflowInstance, { type WorkflowInstanceData } from '../src/models/workflow-instance.ts'
import { canViewWorkflow } from '../src/models/workflow.ts'
import { FediverseService } from '../src/services/fediverse.ts'

class RedisMock {
  readonly data = new Map<string, string>()

  async set (key: string, value: string): Promise<'OK'> {
    await Promise.resolve()
    this.data.set(key, value)
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

void test('private workflow visibility is restricted to its owner', () => {
  equal(canViewWorkflow({ isPrivate: false, userId: null }, 'other-user'), true)
  equal(canViewWorkflow({ isPrivate: true, userId: 'owner' }, 'owner'), true)
  equal(canViewWorkflow({ isPrivate: true, userId: 'owner' }, 'other-user'), false)
  equal(canViewWorkflow({ isPrivate: true, userId: null }), false)
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
  const workflowId = '00000000-0000-0000-0000-000000000001'
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
        return workflow
      }
    }
  }

  diContainer.register({
    redis: asValue(redis as unknown as Redis),
    queue: asValue(queue as unknown as Queue),
    prisma: asValue(prisma as unknown as PrismaClient)
  })

  const instance = await WorkflowInstance.create(workflow)
  ok(persistedBeforeEnqueue)

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
  await new SuccessfulRequestWorker(job).handleJob()

  const saved = await redis.get(`workflow-instance:${workflowId}:${instance.instanceId}`)
  ok(saved !== null)
  const data = JSON.parse(saved) as WorkflowInstanceData
  equal(data.status, 'failed')
})
