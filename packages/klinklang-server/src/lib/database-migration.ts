import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { spawnSync } from 'node:child_process'
import type { DatabaseUrlConfig } from './database.ts'
import { getDatabaseUrl } from './database.ts'

interface MigrationCommandOptions {
  cwd: string
  env: NodeJS.ProcessEnv
}

export type MigrationExecutor = (
  command: string,
  args: string[],
  options: MigrationCommandOptions
) => Promise<void>

const executeMigration: MigrationExecutor = async (command, args, options) => {
  await Promise.resolve()
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit'
  })
  if (result.error !== undefined) {
    throw result.error
  }
  if (result.status === 0) {
    return
  }
  throw new Error(result.signal === null
    ? `Database migration exited with code ${result.status ?? 'unknown'}`
    : `Database migration was terminated by ${result.signal}`)
}

export async function runDatabaseMigrations (
  config: DatabaseUrlConfig,
  executor: MigrationExecutor = executeMigration
): Promise<void> {
  const workspaceRoot = await findWorkspaceDir(process.cwd())
  if (workspaceRoot === undefined) {
    throw new Error('Unable to locate workspace for database migrations')
  }
  await executor(
    'pnpm',
    ['--filter', '@mudkipme/klinklang-prisma', 'run', 'db:migrate:deploy'],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: getDatabaseUrl(config)
      }
    }
  )
}
