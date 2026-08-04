import { diContainer } from '@fastify/awilix'
import type { Workflow } from '@mudkipme/klinklang-prisma'
import { asValue } from 'awilix'
import type { Job, Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import { deepEqual, equal, ok } from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { processAction } from '../src/actions/register.ts'
import type { ActionJobData, ActionJobResult } from '../src/actions/interfaces.ts'
import type { RegExpAction } from '../src/actions/string.ts'
import type { Config } from '../src/lib/config.ts'
import WorkflowInstance from '../src/models/workflow-instance.ts'
import { InMemoryRedis } from './support/in-memory-redis.ts'

interface QueuedJob<T> {
  id: string
  name: string
  data: T
}

const workflowId = '00000000-0000-0000-0000-000000000020'

const regexpWorkflow: Workflow = {
  id: workflowId,
  name: 'Extract and route',
  isPrivate: false,
  enabled: true,
  triggers: [{ type: 'TRIGGER_MANUAL' }],
  definition: {
    StartAt: 'Match',
    States: {
      Match: {
        Type: 'Task',
        Resource: 'REGEXP_MATCH',
        Parameters: {
          'text.$': '$.payload.text',
          pattern: '\\d+'
        },
        ResultPath: '$.match',
        Next: 'Summarize'
      },
      Summarize: {
        Type: 'Pass',
        Parameters: { 'value.$': '$.match.matches[0]' },
        ResultPath: '$.summary',
        Next: 'Route'
      },
      Route: {
        Type: 'Choice',
        Choices: [{ Variable: '$.summary.value', StringEquals: '42', Next: 'Done' }],
        Default: 'Failed'
      },
      Done: { Type: 'Succeed' },
      Failed: { Type: 'Fail', Error: 'NO_MATCH' }
    }
  },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  userId: null
}

void describe('worker and Redis integration', () => {
  let redis = new InMemoryRedis()
  let queuedJobs: Array<QueuedJob<ActionJobData<RegExpAction>>> = []

  beforeEach(() => {
    redis = new InMemoryRedis()
    queuedJobs = []
    const queue = {
      add: async (name: string, data: ActionJobData<RegExpAction>, options: { jobId: string }) => {
        await Promise.resolve()
        const job = { id: options.jobId, name, data }
        queuedJobs.push(job)
        return job
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
      queue: asValue(queue as unknown as Queue)
    })
  })

  void test('runs a queued action through pass and choice states and persists completion', async () => {
    const instance = await WorkflowInstance.create(
      regexpWorkflow,
      { type: 'TRIGGER_MANUAL' },
      { text: 'answer: 42' }
    )

    equal(instance.status, 'pending')
    equal(queuedJobs.length, 1)
    equal(queuedJobs[0].name, 'REGEXP_MATCH')
    deepEqual(queuedJobs[0].data.input, { text: 'answer: 42', pattern: '\\d+' })

    const queued = queuedJobs[0]
    const job = queued as Job<ActionJobData<RegExpAction>, ActionJobResult<RegExpAction>>
    const result = await processAction(job)

    deepEqual(result, { output: { matches: ['42'] }, nextJobId: undefined })
    const persisted = await WorkflowInstance.getInstance(workflowId, instance.instanceId)
    ok(persisted !== null)
    equal(persisted.status, 'completed')
    deepEqual(persisted.context, {
      payload: { text: 'answer: 42' },
      match: { matches: ['42'] },
      summary: { value: '42' }
    })
    equal(redis.expirations.get(`workflow-instance:${workflowId}:${instance.instanceId}`), 3600)
    deepEqual(await WorkflowInstance.getInstancesOfWorkflow(workflowId, 0, 20), [persisted])
  })

  void test('persists a terminal failure without enqueueing a worker job', async () => {
    const workflow: Workflow = {
      ...regexpWorkflow,
      id: `${workflowId.slice(0, -1)}1`,
      definition: {
        StartAt: 'Rejected',
        States: { Rejected: { Type: 'Fail', Error: 'REJECTED' } }
      }
    }

    const instance = await WorkflowInstance.create(workflow, { type: 'TRIGGER_MANUAL' })
    const persisted = await WorkflowInstance.getInstance(workflow.id, instance.instanceId)

    equal(queuedJobs.length, 0)
    ok(persisted !== null)
    equal(persisted.status, 'failed')
    ok(persisted.completedAt !== undefined)
  })
})
