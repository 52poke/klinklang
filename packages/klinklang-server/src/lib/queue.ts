import { Queue } from 'bullmq'
import type { Config } from './config.ts'

const queueName = 'klinklang-queue'

export const getQueue = ({ config }: { config: Config }): Queue =>
  new Queue(queueName, {
    connection: config.get('redis')
  })
