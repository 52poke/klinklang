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
      if (err.message === 'WORKFLOW_INSTANCE_CANCELLED') {
        return
      }
      const attempts = job.opts.attempts ?? 1
      const willRetry = job.attemptsMade < attempts
      void WorkflowInstance.getInstance(job.data.workflowId, job.data.instanceId)
        .then(async (instance) => {
          if (instance !== null) {
            if (job.id === undefined) {
              await instance.fail(err.message)
            } else {
              await instance.recordJobFailure(job.id, err.message, willRetry)
            }
          }
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, 'failed to mark workflow instance as failed')
        })
    }
  })
  return worker
}
