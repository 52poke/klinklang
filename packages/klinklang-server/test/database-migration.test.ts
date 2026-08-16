import { deepEqual, equal, rejects } from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getDatabaseUrl } from '../src/lib/database.ts'
import {
  classifyMigrationSchema,
  runDatabaseMigrations,
  type MigrationDatabaseState,
  type MigrationExecutor,
  type MigrationInspector,
  type MigrationSchemaSnapshot
} from '../src/lib/database-migration.ts'

const inspectAs = (state: MigrationDatabaseState): MigrationInspector => async () => {
  await Promise.resolve()
  return state
}

const getLegacySnapshot = (): MigrationSchemaSnapshot => {
  const auditColumns: Array<[string, string]> = [
    ['createdAt', 'timestamp'],
    ['updatedAt', 'timestamp']
  ]
  const tableColumns: Record<string, Array<[string, string]>> = {
    Action: [
      ['id', 'uuid'], ['actionType', 'text'], ['inputBuilder', 'jsonb'], ['isHead', 'bool'],
      ['outputContext', 'text'], ...auditColumns, ['nextActionId', 'uuid'], ['workflowId', 'uuid']
    ],
    Terminology: [
      ['id', 'int4'], ['textId', 'int4'], ['category', 'text'], ['lang', 'text'], ['text', 'text'],
      ...auditColumns
    ],
    User: [
      ['id', 'uuid'], ['name', 'text'], ['wikiId', 'int8'], ['groups', '_text'], ['token', 'jsonb'],
      ...auditColumns
    ],
    Workflow: [
      ['id', 'uuid'], ['name', 'text'], ['isPrivate', 'bool'], ['enabled', 'bool'], ['triggers', 'jsonb'],
      ['definition', 'jsonb'], ...auditColumns, ['userId', 'uuid']
    ],
    FediInstance: [
      ['id', 'uuid'], ['name', 'text'], ['domain', 'text'], ['clientID', 'text'], ['clientSecret', 'text'],
      ...auditColumns
    ],
    FediAccount: [
      ['id', 'uuid'], ['subject', 'text'], ['fediInstanceId', 'uuid'], ['userId', 'uuid'],
      ['accessToken', 'text'], ...auditColumns
    ]
  }
  const nullable = new Set(['Action.outputContext', 'Action.nextActionId', 'User.groups', 'Workflow.userId'])

  return {
    migrationRecords: 0,
    appliedMigrations: [],
    tables: Object.keys(tableColumns),
    columns: Object.entries(tableColumns).flatMap(([tableName, columns]) => columns.map(([columnName, udtName]) => ({
      tableName,
      columnName,
      udtName,
      nullable: nullable.has(`${tableName}.${columnName}`)
    }))),
    constraints: [
      'Action_pkey', 'Terminology_pkey', 'User_pkey', 'Workflow_pkey',
      'Action_nextActionId_fkey', 'Action_workflowId_fkey', 'Workflow_userId_fkey',
      'FediInstance_pkey', 'FediAccount_pkey', 'FediAccount_fediInstanceId_fkey',
      'FediAccount_userId_fkey'
    ],
    indexes: [
      'Action_nextActionId_key', 'User_name_key', 'User_wikiId_key',
      'FediInstance_domain_key', 'FediAccount_subject_key'
    ]
  }
}

void describe('database startup migration', () => {
  void test('uses the application database URL and production migration command', async () => {
    const databaseUrl = 'postgresql://test:test@database.example/klinklang'
    let inspectedUrl = ''
    let executed: { command: string, args: string[], databaseUrl?: string } | null = null
    const executor: MigrationExecutor = async (command, args, options) => {
      await Promise.resolve()
      executed = { command, args, databaseUrl: options.env.DATABASE_URL }
    }
    const inspector: MigrationInspector = async (url) => {
      inspectedUrl = url
      await Promise.resolve()
      return { kind: 'managed' }
    }

    await runDatabaseMigrations({ get: () => databaseUrl }, executor, inspector)

    equal(inspectedUrl, databaseUrl)
    deepEqual(executed, {
      command: 'pnpm',
      args: ['--filter', '@mudkipme/klinklang-prisma', 'run', 'db:migrate:deploy'],
      databaseUrl
    })
  })

  void test('baselines the three legacy migrations before deploying pending migrations', async () => {
    const calls: string[][] = []
    const reports: string[] = []
    const executor: MigrationExecutor = async (_command, args) => {
      await Promise.resolve()
      calls.push(args)
    }

    await runDatabaseMigrations(
      { get: () => 'postgresql://test/db' },
      executor,
      inspectAs({
        kind: 'legacy',
        migrations: [
          '20220327183625_init',
          '20230904171424_fedi_account',
          '20260122124500_add_workflow_definition'
        ]
      }),
      (message) => { reports.push(message) }
    )

    deepEqual(calls, [
      [
        '--filter', '@mudkipme/klinklang-prisma', 'exec', 'prisma', 'migrate', 'resolve',
        '--applied', '20220327183625_init'
      ],
      [
        '--filter', '@mudkipme/klinklang-prisma', 'exec', 'prisma', 'migrate', 'resolve',
        '--applied', '20230904171424_fedi_account'
      ],
      [
        '--filter', '@mudkipme/klinklang-prisma', 'exec', 'prisma', 'migrate', 'resolve',
        '--applied', '20260122124500_add_workflow_definition'
      ],
      ['--filter', '@mudkipme/klinklang-prisma', 'run', 'db:migrate:deploy']
    ])
    equal(reports.length, 1)
  })

  void test('runs deploy directly for a fresh database', async () => {
    const calls: string[][] = []
    const executor: MigrationExecutor = async (_command, args) => {
      await Promise.resolve()
      calls.push(args)
    }

    await runDatabaseMigrations(
      { get: () => 'postgresql://test/db' },
      executor,
      inspectAs({ kind: 'empty' })
    )

    deepEqual(calls, [
      ['--filter', '@mudkipme/klinklang-prisma', 'run', 'db:migrate:deploy']
    ])
  })

  void test('refuses to baseline an unfamiliar or partial database', async () => {
    let executed = false
    const executor: MigrationExecutor = async () => {
      executed = true
      await Promise.resolve()
    }

    await rejects(async () => {
      await runDatabaseMigrations(
        { get: () => 'postgresql://test/db' },
        executor,
        inspectAs({ kind: 'incompatible', reasons: ['missing table Workflow'] })
      )
    }, /No migration records were changed.*missing table Workflow/v)
    equal(executed, false)
  })

  void test('recognizes empty and managed schemas before checking legacy objects', () => {
    const emptySnapshot: MigrationSchemaSnapshot = {
      migrationRecords: 0,
      appliedMigrations: [],
      tables: [],
      columns: [],
      constraints: [],
      indexes: []
    }

    deepEqual(classifyMigrationSchema(emptySnapshot), { kind: 'empty' })
    deepEqual(classifyMigrationSchema({ ...emptySnapshot, migrationRecords: 1 }), { kind: 'managed' })
  })

  void test('recognizes the complete legacy schema and resumes an interrupted baseline', () => {
    const snapshot = getLegacySnapshot()
    deepEqual(classifyMigrationSchema(snapshot), {
      kind: 'legacy',
      migrations: [
        '20220327183625_init',
        '20230904171424_fedi_account',
        '20260122124500_add_workflow_definition'
      ]
    })
    deepEqual(classifyMigrationSchema({
      ...snapshot,
      migrationRecords: 1,
      appliedMigrations: ['20220327183625_init']
    }), {
      kind: 'legacy',
      migrations: [
        '20230904171424_fedi_account',
        '20260122124500_add_workflow_definition'
      ]
    })
  })

  void test('detects a partially applied revision migration as incompatible', () => {
    const state = classifyMigrationSchema({
      migrationRecords: 0,
      appliedMigrations: [],
      tables: ['Workflow', 'WorkflowRevision'],
      columns: [],
      constraints: [],
      indexes: []
    })

    equal(state.kind, 'incompatible')
    equal(state.reasons[0], 'workflow revision objects already exist without migration history')
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
      await runDatabaseMigrations(
        { get: () => 'postgresql://test/db' },
        executor,
        inspectAs({ kind: 'managed' })
      )
    }, /migration failed/v)
  })
})
