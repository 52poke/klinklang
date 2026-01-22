import { PrismaClient } from '@mudkipme/klinklang-prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import type { Config } from './config.ts'

export type { PrismaClient }

export const getClient = ({ config }: { config: Config }): PrismaClient => {
  const envUrl = process.env.DATABASE_URL
  let databaseUrl = config.get('db.url')
  if (databaseUrl === '') {
    databaseUrl = envUrl ?? ''
  }
  if (databaseUrl === '') {
    throw new Error('DATABASE_URL is required for Prisma')
  }
  const pool = new Pool({ connectionString: databaseUrl })
  return new PrismaClient({
    adapter: new PrismaPg(pool)
  })
}
