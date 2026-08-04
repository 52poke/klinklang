import { diContainer } from '@fastify/awilix'
import type { Workflow } from '@mudkipme/klinklang-prisma'
import { asValue } from 'awilix'
import { Queue, QueueEvents, Worker } from 'bullmq'
import { Redis, type RedisOptions } from 'ioredis'
import { equal, ok } from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { processAction } from '../src/actions/register.ts'
import type { ActionJobData, ActionJobResult } from '../src/actions/interfaces.ts'
import type { RegExpAction } from '../src/actions/string.ts'
import type { Config } from '../src/lib/config.ts'
import WorkflowInstance from '../src/models/workflow-instance.ts'

const redisUrl = process.env.KLINKLANG_TEST_REDIS_URL

const getConnectionOptions = (urlValue: string): RedisOptions => {
  const url = new URL(urlValue)
  const databasePath = url.pathname.slice(1)
  return {
    host: url.hostname,
    port: url.port === '' ? 6379 : Number(url.port),
    ...(url.username === '' ? {} : { username: decodeURIComponent(url.username) }),
    ...(url.password === '' ? {} : { password: decodeURIComponent(url.password) }),
    ...(databasePath === '' ? {} : { db: Number(databasePath) }),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null
  }
}

void test('executes a BullMQ job and persists its instance in real Redis', {
  skip: redisUrl === undefined ? 'set KLINKLANG_TEST_REDIS_URL to run the Redis integration test' : false
}, async () => {
  if (redisUrl === undefined) {
    throw new Error('KLINKLANG_TEST_REDIS_URL is required')
  }
  const connection = getConnectionOptions(redisUrl)
  const redis = new Redis(connection)
  const queueName = `klinklang-test-${randomUUID()}`
  const queue = new Queue<ActionJobData<RegExpAction>, ActionJobResult<RegExpAction>>(queueName, { connection })
  const queueEvents = new QueueEvents(queueName, { connection })
  const worker = new Worker<ActionJobData<RegExpAction>, ActionJobResult<RegExpAction>>(
    queueName,
    async job => await processAction(job),
    { connection }
  )
  const workflowId = randomUUID()
  let instanceId: string | undefined = undefined

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
    redis: asValue(redis),
    queue: asValue(queue)
  })

  try {
    await Promise.all([queue.waitUntilReady(), queueEvents.waitUntilReady(), worker.waitUntilReady()])
    const workflow: Workflow = {
      id: workflowId,
      name: 'Redis integration',
      isPrivate: false,
      enabled: true,
      triggers: [{ type: 'TRIGGER_MANUAL' }],
      definition: {
        StartAt: 'Match',
        States: {
          Match: {
            Type: 'Task',
            Resource: 'REGEXP_MATCH',
            Parameters: { text: 'answer: 42', pattern: '\\d+' },
            End: true
          }
        }
      },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      userId: null
    }

    const instance = await WorkflowInstance.create(workflow, { type: 'TRIGGER_MANUAL' })
    instanceId = instance.instanceId
    const job = await queue.getJob(instance.firstJobId)
    ok(job !== undefined)
    await job.waitUntilFinished(queueEvents, 10_000)

    const persisted = await WorkflowInstance.getInstance(workflowId, instance.instanceId)
    ok(persisted !== null)
    equal(persisted.status, 'completed')
  } finally {
    await worker.close()
    await queueEvents.close()
    await queue.obliterate({ force: true })
    await queue.close()
    if (instanceId !== undefined) {
      await redis.del(
        `workflow-instance:${workflowId}:${instanceId}`,
        `workflow-instances:${workflowId}`
      )
    }
    await redis.quit()
  }
})
