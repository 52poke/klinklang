import { deepEqual, equal, rejects } from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getDatabaseUrl } from '../src/lib/database.ts'
import { runDatabaseMigrations, type MigrationExecutor } from '../src/lib/database-migration.ts'

void describe('database startup migration', () => {
  void test('uses the application database URL and production migration command', async () => {
    const databaseUrl = 'postgresql://test:test@database.example/klinklang'
    let executed: { command: string; args: string[]; databaseUrl?: string } | null = null
    const executor: MigrationExecutor = async (command, args, options) => {
      await Promise.resolve()
      executed = { command, args, databaseUrl: options.env.DATABASE_URL }
    }

    await runDatabaseMigrations({ get: () => databaseUrl }, executor)

    deepEqual(executed, {
      command: 'pnpm',
      args: ['--filter', '@mudkipme/klinklang-prisma', 'run', 'db:migrate:deploy'],
      databaseUrl
    })
  })

  void test('falls back to DATABASE_URL and fails before startup when no URL exists', async () => {
    equal(getDatabaseUrl({ get: () => '' }, { DATABASE_URL: 'postgresql://fallback/db' }), 'postgresql://fallback/db')
    await rejects(async () => {
      await Promise.resolve(getDatabaseUrl({ get: () => '' }, {}))
    }, /DATABASE_URL is required/v)
  })

  void test('propagates migration failures so the application does not start', async () => {
    const executor: MigrationExecutor = async () => {
      await Promise.resolve()
      throw new Error('migration failed')
    }
    await rejects(async () => {
      await runDatabaseMigrations({ get: () => 'postgresql://test/db' }, executor)
    }, /migration failed/v)
  })
})
