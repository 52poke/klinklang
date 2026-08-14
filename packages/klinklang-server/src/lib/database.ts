import { PrismaClient } from '@mudkipme/klinklang-prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import type { Config } from './config.ts'

export type { PrismaClient }

export interface DatabaseUrlConfig {
  get: (path: 'db.url') => string
}

export const getDatabaseUrl = (
  config: DatabaseUrlConfig,
  environment: NodeJS.ProcessEnv = process.env
): string => {
  let databaseUrl = config.get('db.url')
  if (databaseUrl === '') {
    databaseUrl = environment.DATABASE_URL ?? ''
  }
  if (databaseUrl === '') {
    throw new Error('DATABASE_URL is required for Prisma')
  }
  return databaseUrl
}

export const getClient = ({ config }: { config: Config }): PrismaClient => {
  const databaseUrl = getDatabaseUrl(config)
  const pool = new Pool({ connectionString: databaseUrl })
  return new PrismaClient({
    adapter: new PrismaPg(pool)
  })
}
