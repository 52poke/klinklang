import { type Job, Worker } from 'bullmq'
import type { Logger } from 'pino'
import type { ActionContract, ActionJobData, ActionJobResult } from '../actions/interfaces.ts'
import { processAction } from '../actions/register.ts'
import WorkflowInstance from '../models/workflow-instance.ts'
import type { Config } from './config.ts'

const queueName = 'klinklang-queue'

export const getWorker = ({ config, logger }: { config: Config; logger: Logger }): Worker => {
  const worker = new Worker(
    queueName,
    async <T extends ActionContract>(job: Job<ActionJobData<T>, ActionJobResult<T>>) => await processAction(job),
    {
      connection: config.get('redis'),
      autorun: false,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 }
    }
  )

  worker.on('failed', (job, err) => {
    logger.error(`job ${job?.id ?? ''} failed: ${err.message}`)
    if (job?.data !== undefined) {
      const attempts = job.opts.attempts ?? 1
      if (job.attemptsMade < attempts) {
        return
      }
      void WorkflowInstance.getInstance(job.data.workflowId, job.data.instanceId)
        .then(async (instance) => {
          if (instance !== null) {
            await instance.fail()
          }
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, 'failed to mark workflow instance as failed')
        })
    }
  })
  return worker
}
