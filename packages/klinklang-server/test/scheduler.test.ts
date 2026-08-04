import type { Workflow } from '@mudkipme/klinklang-prisma'
import type { Redis } from 'ioredis'
import { equal, match } from 'node:assert/strict'
import { setImmediate as waitForImmediate } from 'node:timers/promises'
import { describe, test, type TestContext } from 'node:test'
import type { Logger } from 'pino'
import { CronScheduler } from '../src/lib/cron.ts'
import type { PrismaClient } from '../src/lib/database.ts'
import type { Notification } from '../src/lib/notification.ts'

const scheduledWorkflow = {
  id: '00000000-0000-0000-0000-000000000010',
  enabled: true,
  triggers: [{ type: 'TRIGGER_CRON', pattern: '* * * * *' }]
} as unknown as Workflow

const flushAsyncWork = async (): Promise<void> => {
  await waitForImmediate()
}

const enableTimers = (context: TestContext): void => {
  context.mock.timers.enable({
    apis: ['Date', 'setTimeout'],
    now: new Date('2026-01-01T00:00:30.000Z')
  })
}

const loggerStub = (errors: string[] = []): Logger => ({
  error: (...args: unknown[]) => {
    errors.push(args.map(String).join(' '))
  }
}) as unknown as Logger

void describe('cron scheduler', () => {
  void test('fires once per occurrence when another process owns the distributed lock', async (context) => {
    enableTimers(context)
    let lockAttempts = 0
    const redis = {
      set: async () => {
        await Promise.resolve()
        lockAttempts += 1
        return null
      }
    }
    const prisma = {
      workflow: {
        findMany: async () => {
          await Promise.resolve()
          return [scheduledWorkflow]
        }
      }
    }
    const scheduler = new CronScheduler({
      prisma: prisma as unknown as PrismaClient,
      redis: redis as unknown as Redis,
      logger: loggerStub(),
      notification: new EventTarget() as Notification
    })

    await scheduler.start()
    context.mock.timers.tick(30_000)
    await flushAsyncWork()
    equal(lockAttempts, 1)

    context.mock.timers.tick(60_000)
    await flushAsyncWork()
    equal(lockAttempts, 2)
    scheduler.stop()
  })

  void test('cancels schedules removed by a workflow update notification', async (context) => {
    enableTimers(context)
    const notification = new EventTarget()
    let queryCount = 0
    const prisma = {
      workflow: {
        findMany: async () => {
          await Promise.resolve()
          queryCount += 1
          if (queryCount === 1) {
            return [scheduledWorkflow]
          }
          return []
        }
      }
    }
    let lockAttempts = 0
    const redis = {
      set: async () => {
        await Promise.resolve()
        lockAttempts += 1
        return null
      }
    }
    const scheduler = new CronScheduler({
      prisma: prisma as unknown as PrismaClient,
      redis: redis as unknown as Redis,
      logger: loggerStub(),
      notification: notification as Notification
    })

    await scheduler.start()
    notification.dispatchEvent(new CustomEvent('notification', {
      detail: { type: 'WORKFLOW_EVENTBUS_UPDATE' }
    }))
    await flushAsyncWork()
    context.mock.timers.tick(30_000)
    await flushAsyncWork()

    equal(queryCount, 2)
    equal(lockAttempts, 0)
    scheduler.stop()
  })

  void test('logs invalid cron expressions without creating timers', async (context) => {
    enableTimers(context)
    const errors: string[] = []
    const prisma = {
      workflow: {
        findMany: async () => {
          await Promise.resolve()
          return [{
            ...scheduledWorkflow,
            triggers: [{ type: 'TRIGGER_CRON', pattern: 'not a cron expression' }]
          }]
        }
      }
    }
    let lockAttempts = 0
    const redis = {
      set: async () => {
        await Promise.resolve()
        lockAttempts += 1
        return null
      }
    }
    const scheduler = new CronScheduler({
      prisma: prisma as unknown as PrismaClient,
      redis: redis as unknown as Redis,
      logger: loggerStub(errors),
      notification: new EventTarget() as Notification
    })

    await scheduler.start()
    context.mock.timers.tick(24 * 60 * 60 * 1000)
    await flushAsyncWork()

    equal(lockAttempts, 0)
    match(errors.join('\n'), /invalid cron pattern/v)
    scheduler.stop()
  })
})
