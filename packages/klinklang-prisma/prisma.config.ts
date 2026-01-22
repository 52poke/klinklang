/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- env typing */
import { env } from 'node:process'
import { defineConfig } from 'prisma/config'

const databaseUrl = env.DATABASE_URL ?? env.DB_URL
if (databaseUrl === undefined || databaseUrl === '') {
  throw new Error('DATABASE_URL or DB_URL must be set for Prisma')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: databaseUrl
  }
})
