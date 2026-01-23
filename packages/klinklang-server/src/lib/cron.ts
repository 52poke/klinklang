import { CronExpressionParser } from 'cron-parser'
import type { Redis } from 'ioredis'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { Logger } from 'pino'
import type { PrismaClient } from '../lib/database.ts'
import type { WorkflowTrigger } from '../models/workflow-type.ts'
import { createInstanceWithWorkflow } from '../models/workflow.ts'
import type { MessageType, Notification } from './notification.ts'

interface CronTriggerEntry {
  workflowId: string
  trigger: Extract<WorkflowTrigger, { type: 'TRIGGER_CRON' }>
}

interface CronSchedulerDeps {
  prisma: PrismaClient
  redis: Redis
  logger: Logger
  notification: Notification
}

const LOCK_TTL_SECONDS = 60
export class CronScheduler {
  readonly #timers = new Map<string, NodeJS.Timeout>()
  readonly #deps: CronSchedulerDeps

  constructor (deps: CronSchedulerDeps) {
    this.#deps = deps
  }

  async start (): Promise<void> {
    await this.refresh()
    this.#deps.notification.addEventListener('notification', (event: Event) => {
      const evt = event as CustomEvent<MessageType>
      if (evt.detail.type === 'WORKFLOW_EVENTBUS_UPDATE') {
        void this.refresh()
      }
    })
  }

  stop (): void {
    for (const timer of this.#timers.values()) {
      clearTimeout(timer)
    }
    this.#timers.clear()
  }

  private scheduleNext (entry: CronTriggerEntry): void {
    const key = CronScheduler.getKey(entry)
    const now = new Date()
    const delayMs = (() => {
      try {
        const interval = CronExpressionParser.parse(entry.trigger.pattern, { currentDate: now })
        const nextRun = interval.next().toDate()
        return Math.max(0, nextRun.getTime() - Date.now())
      } catch (error) {
        this.#deps.logger.error({ err: error, pattern: entry.trigger.pattern }, 'invalid cron pattern')
        return null
      }
    })()

    if (delayMs === null) {
      return
    }

    const timer = setTimeout(() => {
      void this.runTrigger(entry)
    }, delayMs)
    this.#timers.set(key, timer)
  }

  private async runTrigger (entry: CronTriggerEntry): Promise<void> {
    const key = CronScheduler.getKey(entry)
    this.#timers.delete(key)

    try {
      const ok = await this.#deps.redis.set(CronScheduler.getLockKey(entry), '1', 'EX', LOCK_TTL_SECONDS, 'NX')
      if (ok === null) {
        this.scheduleNext(entry)
        return
      }

      const workflow = await this.#deps.prisma.workflow.findUnique({ where: { id: entry.workflowId } })
      if (workflow?.enabled !== true) {
        this.scheduleNext(entry)
        return
      }

      await createInstanceWithWorkflow(workflow, entry.trigger)
    } catch (error) {
      this.#deps.logger.error({ err: error, workflowId: entry.workflowId }, 'cron trigger failed')
    } finally {
      await delay(0)
      this.scheduleNext(entry)
    }
  }

  private async refresh (): Promise<void> {
    const workflows = await this.#deps.prisma.workflow.findMany({
      where: {
        enabled: true,
        triggers: {
          array_contains: [{ type: 'TRIGGER_CRON' }]
        }
      }
    })

    const entries: CronTriggerEntry[] = []
    for (const workflow of workflows) {
      for (const trigger of workflow.triggers as WorkflowTrigger[]) {
        if (trigger.type === 'TRIGGER_CRON') {
          entries.push({ workflowId: workflow.id, trigger })
        }
      }
    }

    const activeKeys = new Set(entries.map(entry => CronScheduler.getKey(entry)))
    for (const [key, timer] of this.#timers.entries()) {
      if (!activeKeys.has(key)) {
        clearTimeout(timer)
        this.#timers.delete(key)
      }
    }

    for (const entry of entries) {
      const key = CronScheduler.getKey(entry)
      if (!this.#timers.has(key)) {
        this.scheduleNext(entry)
      }
    }
  }

  private static getKey (entry: CronTriggerEntry): string {
    return `${entry.workflowId}:${entry.trigger.pattern}`
  }

  private static getLockKey (entry: CronTriggerEntry): string {
    const hash = createHash('sha256').update(entry.trigger.pattern).digest('hex')
    return `cron:trigger:${entry.workflowId}:${hash}`
  }
}

export const startCronScheduler = async (deps: CronSchedulerDeps): Promise<CronScheduler> => {
  const scheduler = new CronScheduler(deps)
  await scheduler.start()
  return scheduler
}
