import { PrismaClient } from '@mudkipme/klinklang-prisma'
import type { Config } from './config.js'

export type { PrismaClient }

export const getClient = ({ config }: { config: Config }): PrismaClient =>
  new PrismaClient({
    datasources: {
      db: config.get('db')
    }
  })
