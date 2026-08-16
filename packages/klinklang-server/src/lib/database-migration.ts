import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { spawnSync } from 'node:child_process'
import { Client } from 'pg'
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

interface SchemaColumn {
  tableName: string
  columnName: string
  udtName: string
  nullable: boolean
}

export interface MigrationSchemaSnapshot {
  migrationRecords: number
  appliedMigrations: readonly string[]
  tables: readonly string[]
  columns: readonly SchemaColumn[]
  constraints: readonly string[]
  indexes: readonly string[]
}

export type MigrationDatabaseState =
  | { kind: 'empty' | 'managed' }
  | { kind: 'legacy', migrations: readonly string[] }
  | { kind: 'incompatible', reasons: readonly string[] }

export type MigrationInspector = (databaseUrl: string) => Promise<MigrationDatabaseState>
export type MigrationReporter = (message: string) => void

const legacyMigrations = [
  '20220327183625_init',
  '20230904171424_fedi_account',
  '20260122124500_add_workflow_definition'
] as const

interface LegacyTableDefinition {
  columns: Readonly<Record<string, string>>
  nullable?: readonly string[]
}

const legacyTables: Readonly<Record<string, LegacyTableDefinition>> = {
  Action: {
    columns: {
      id: 'uuid',
      actionType: 'text',
      inputBuilder: 'jsonb',
      isHead: 'bool',
      outputContext: 'text',
      createdAt: 'timestamp',
      updatedAt: 'timestamp',
      nextActionId: 'uuid',
      workflowId: 'uuid'
    },
    nullable: ['outputContext', 'nextActionId']
  },
  Terminology: {
    columns: {
      id: 'int4',
      textId: 'int4',
      category: 'text',
      lang: 'text',
      text: 'text',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    }
  },
  User: {
    columns: {
      id: 'uuid',
      name: 'text',
      wikiId: 'int8',
      groups: '_text',
      token: 'jsonb',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    },
    nullable: ['groups']
  },
  Workflow: {
    columns: {
      id: 'uuid',
      name: 'text',
      isPrivate: 'bool',
      enabled: 'bool',
      triggers: 'jsonb',
      definition: 'jsonb',
      createdAt: 'timestamp',
      updatedAt: 'timestamp',
      userId: 'uuid'
    },
    nullable: ['userId']
  },
  FediInstance: {
    columns: {
      id: 'uuid',
      name: 'text',
      domain: 'text',
      clientID: 'text',
      clientSecret: 'text',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    }
  },
  FediAccount: {
    columns: {
      id: 'uuid',
      subject: 'text',
      fediInstanceId: 'uuid',
      userId: 'uuid',
      accessToken: 'text',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    }
  }
}

const legacyConstraints = [
  'Action_pkey',
  'Terminology_pkey',
  'User_pkey',
  'Workflow_pkey',
  'Action_nextActionId_fkey',
  'Action_workflowId_fkey',
  'Workflow_userId_fkey',
  'FediInstance_pkey',
  'FediAccount_pkey',
  'FediAccount_fediInstanceId_fkey',
  'FediAccount_userId_fkey'
] as const

const legacyIndexes = [
  'Action_nextActionId_key',
  'User_name_key',
  'User_wikiId_key',
  'FediInstance_domain_key',
  'FediAccount_subject_key'
] as const

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

const columnKey = (tableName: string, columnName: string): string => `${tableName}.${columnName}`

export function classifyMigrationSchema (snapshot: MigrationSchemaSnapshot): MigrationDatabaseState {
  const appliedMigrations = new Set(snapshot.appliedMigrations)
  const isInterruptedBaseline = snapshot.migrationRecords > 0 &&
    snapshot.migrationRecords === snapshot.appliedMigrations.length &&
    snapshot.appliedMigrations.every((migration) => legacyMigrations.includes(
      migration as typeof legacyMigrations[number]
    ))

  if (snapshot.migrationRecords > 0 && !isInterruptedBaseline) {
    return { kind: 'managed' }
  }

  const migrationsToResolve = legacyMigrations.filter((migration) => !appliedMigrations.has(migration))
  if (migrationsToResolve.length === 0) {
    return { kind: 'managed' }
  }

  const applicationTables = snapshot.tables.filter((table) => table !== '_prisma_migrations')
  if (applicationTables.length === 0) {
    return snapshot.migrationRecords === 0
      ? { kind: 'empty' }
      : { kind: 'incompatible', reasons: ['migration baseline records exist but application tables are missing'] }
  }

  const reasons: string[] = []
  const tables = new Set(snapshot.tables)
  const columns = new Map(snapshot.columns.map((column) => [
    columnKey(column.tableName, column.columnName),
    column
  ]))

  if (tables.has('WorkflowRevision') || columns.has(columnKey('Workflow', 'currentRevision'))) {
    reasons.push('workflow revision objects already exist without migration history')
  }

  for (const [tableName, definition] of Object.entries(legacyTables)) {
    if (!tables.has(tableName)) {
      reasons.push(`missing table ${tableName}`)
      continue
    }
    const nullableColumns = new Set(definition.nullable ?? [])
    for (const [columnName, udtName] of Object.entries(definition.columns)) {
      const column = columns.get(columnKey(tableName, columnName))
      if (column === undefined) {
        reasons.push(`missing column ${tableName}.${columnName}`)
        continue
      }
      if (column.udtName !== udtName) {
        reasons.push(`column ${tableName}.${columnName} has type ${column.udtName}, expected ${udtName}`)
      }
      const expectedNullable = nullableColumns.has(columnName)
      if (column.nullable !== expectedNullable) {
        reasons.push(`column ${tableName}.${columnName} has unexpected nullability`)
      }
    }
  }

  const constraints = new Set(snapshot.constraints)
  for (const constraint of legacyConstraints) {
    if (!constraints.has(constraint)) {
      reasons.push(`missing constraint ${constraint}`)
    }
  }

  const indexes = new Set(snapshot.indexes)
  for (const index of legacyIndexes) {
    if (!indexes.has(index)) {
      reasons.push(`missing index ${index}`)
    }
  }

  return reasons.length === 0
    ? { kind: 'legacy', migrations: migrationsToResolve }
    : { kind: 'incompatible', reasons }
}

const inspectMigrationState: MigrationInspector = async (databaseUrl) => {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const databaseSchema = new URL(databaseUrl).searchParams.get('schema') ?? 'public'
    await client.query(
      `SELECT set_config('search_path', quote_ident($1), false)`,
      [databaseSchema]
    )
    const tablesResult = await client.query<{ tableName: string }>(`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_type = 'BASE TABLE'
    `)
    const tables = tablesResult.rows.map(({ tableName }) => tableName)

    let migrationRecords = 0
    let appliedMigrations: string[] = []
    if (tables.includes('_prisma_migrations')) {
      const [countResult, appliedResult] = await Promise.all([
        client.query<{ count: number }>(
          'SELECT COUNT(*)::int AS count FROM "_prisma_migrations"'
        ),
        client.query<{ migrationName: string }>(`
          SELECT migration_name AS "migrationName"
          FROM "_prisma_migrations"
          WHERE finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        `)
      ])
      migrationRecords = countResult.rows[0]?.count ?? 0
      appliedMigrations = appliedResult.rows.map(({ migrationName }) => migrationName)
    }

    const [columnsResult, constraintsResult, indexesResult] = await Promise.all([
      client.query<{
        tableName: string
        columnName: string
        udtName: string
        isNullable: 'YES' | 'NO'
      }>(`
        SELECT
          table_name AS "tableName",
          column_name AS "columnName",
          udt_name AS "udtName",
          is_nullable AS "isNullable"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
      `),
      client.query<{ name: string }>(`
        SELECT constraint_name AS name
        FROM information_schema.table_constraints
        WHERE constraint_schema = current_schema()
      `),
      client.query<{ name: string }>(`
        SELECT indexname AS name
        FROM pg_indexes
        WHERE schemaname = current_schema()
      `)
    ])

    return classifyMigrationSchema({
      migrationRecords,
      appliedMigrations,
      tables,
      columns: columnsResult.rows.map((column) => ({
        tableName: column.tableName,
        columnName: column.columnName,
        udtName: column.udtName,
        nullable: column.isNullable === 'YES'
      })),
      constraints: constraintsResult.rows.map(({ name }) => name),
      indexes: indexesResult.rows.map(({ name }) => name)
    })
  } finally {
    await client.end()
  }
}

const reportMigration: MigrationReporter = (message) => {
  process.stdout.write(`${message}\n`)
}

export async function runDatabaseMigrations (
  config: DatabaseUrlConfig,
  executor: MigrationExecutor = executeMigration,
  inspector: MigrationInspector = inspectMigrationState,
  reporter: MigrationReporter = reportMigration
): Promise<void> {
  const workspaceRoot = await findWorkspaceDir(process.cwd())
  if (workspaceRoot === undefined) {
    throw new Error('Unable to locate workspace for database migrations')
  }

  const databaseUrl = getDatabaseUrl(config)
  const commandOptions = {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    }
  }
  const state = await inspector(databaseUrl)

  if (state.kind === 'incompatible') {
    throw new Error(
      'Cannot automatically baseline the non-empty database because it does not match the legacy Klinklang schema. ' +
      `No migration records were changed. ${state.reasons.join('; ')}`
    )
  }

  if (state.kind === 'legacy') {
    reporter('Legacy Klinklang database detected; recording the existing schema as the migration baseline.')
    for (const migration of state.migrations) {
      await executor(
        'pnpm',
        [
          '--filter',
          '@mudkipme/klinklang-prisma',
          'exec',
          'prisma',
          'migrate',
          'resolve',
          '--applied',
          migration
        ],
        commandOptions
      )
    }
  }

  await executor(
    'pnpm',
    ['--filter', '@mudkipme/klinklang-prisma', 'run', 'db:migrate:deploy'],
    commandOptions
  )
}
