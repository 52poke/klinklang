import { Redis } from 'ioredis'
import type { Config } from './config.js'

export const getRedis = ({ config }: { config: Config }): Redis =>
  new Redis({
    ...config.get('redis'),
    keyPrefix: config.get('app').prefix,
    enableAutoPipelining: true
  })
