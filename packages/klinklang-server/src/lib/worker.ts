import { type Job, Worker } from 'bullmq'
import { type Logger } from 'pino'
import { type ActionJobData, type ActionJobResult } from '../actions/interfaces.js'
import { processAction } from '../actions/register.js'
import { type Config } from './config.js'

const queueName = 'klinklang-queue'

export const getWorker = ({ config, logger }: { config: Config; logger: Logger }): Worker => {
  const worker = new Worker(queueName, async (job: Job<ActionJobData<any>, ActionJobResult<any>>) => {
    return await processAction(job)
  }, {
    connection: config.get('redis'),
    autorun: false,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 }
  })

  worker.on('failed', (job, err) => {
    logger.error(`job ${job?.id ?? ''} failed: ${err.message}`)
  })
  return worker
}
