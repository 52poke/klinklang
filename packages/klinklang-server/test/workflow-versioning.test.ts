import { diContainer, fastifyAwilixPlugin } from '@fastify/awilix'
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'
import type { PrismaClient, Workflow, WorkflowRevision } from '@mudkipme/klinklang-prisma'
import { asValue } from 'awilix'
import { deepEqual, equal, match, ok } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, describe, test } from 'node:test'
import { fastify, type FastifyInstance, type FastifyRequest } from 'fastify'
import type { Redis } from 'ioredis'
import { httpErrorHandler } from '../src/lib/http-errors.ts'
import type { Notification } from '../src/lib/notification.ts'
import workflowVersionRoutes from '../src/routes/workflow-version.ts'
import workflowRoutes from '../src/routes/workflow.ts'

const ownerId = '00000000-0000-4000-8000-000000000011'
const otherId = '00000000-0000-4000-8000-000000000012'
const workflowId = '00000000-0000-4000-8000-000000000013'
const createdAt = new Date('2026-08-14T00:00:00.000Z')

const initialWorkflow: Workflow = {
  id: workflowId,
  name: 'Versioned workflow',
  isPrivate: true,
  enabled: true,
  triggers: [{ type: 'TRIGGER_MANUAL' }],
  definition: { StartAt: 'Done', States: { Done: { Type: 'Succeed' } } },
  currentRevision: 1,
  createdAt,
  updatedAt: createdAt,
  userId: ownerId
}

const initialRevision: WorkflowRevision = {
  workflowId,
  revision: 1,
  name: initialWorkflow.name,
  isPrivate: initialWorkflow.isPrivate,
  enabled: initialWorkflow.enabled,
  triggers: initialWorkflow.triggers,
  definition: initialWorkflow.definition,
  changeKind: 'CREATE',
  sourceWorkflowId: null,
  sourceRevision: null,
  createdById: ownerId,
  createdAt
}

void describe('workflow versioning routes', () => {
  const app: FastifyInstance = fastify()
  const workflows = new Map<string, Workflow>([[workflowId, initialWorkflow]])
  const revisions: WorkflowRevision[] = [initialRevision]
  let nextId = 20
  let redisInstances: string[] = []

  before(async () => {
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    app.setErrorHandler(httpErrorHandler)

    const workflowDelegate = {
      findMany: async () => await Promise.resolve(Array.from(workflows.values())),
      findUnique: async ({ where }: { where: { id: string } }) => await Promise.resolve(workflows.get(where.id) ?? null),
      create: async ({ data }: { data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'currentRevision'> }) => {
        const id = `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`
        nextId += 1
        const workflow: Workflow = {
          ...data,
          id,
          currentRevision: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        workflows.set(id, workflow)
        return await Promise.resolve(workflow)
      },
      update: async ({ where, data }: {
        where: { id: string; currentRevision?: number }
        data: Partial<Omit<Workflow, 'currentRevision'>> & { currentRevision?: { increment: number } }
      }) => {
        const workflow = workflows.get(where.id)
        if (workflow === undefined || (where.currentRevision !== undefined
          && where.currentRevision !== workflow.currentRevision)) {
          throw new Error('record conflict')
        }
        const revision = data.currentRevision === undefined
          ? workflow.currentRevision
          : workflow.currentRevision + data.currentRevision.increment
        const updated: Workflow = {
          ...workflow,
          ...data,
          currentRevision: revision,
          updatedAt: new Date()
        }
        workflows.set(updated.id, updated)
        return await Promise.resolve(updated)
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const workflow = workflows.get(where.id)
        if (workflow === undefined) throw new Error('missing workflow')
        workflows.delete(where.id)
        for (let index = revisions.length - 1; index >= 0; index -= 1) {
          if (revisions[index].workflowId === where.id) revisions.splice(index, 1)
        }
        return await Promise.resolve(workflow)
      }
    }
    const workflowRevisionDelegate = {
      create: async ({ data }: { data: Omit<WorkflowRevision, 'createdAt'> }) => {
        const revision: WorkflowRevision = { ...data, createdAt: new Date() }
        revisions.push(revision)
        return await Promise.resolve(revision)
      },
      findMany: async ({ where, orderBy }: {
        where: { workflowId: string; revision?: { in: number[] } }
        orderBy?: { revision: 'desc' }
      }) => {
        const found = revisions.filter(revision => revision.workflowId === where.workflowId
          && (where.revision === undefined || where.revision.in.includes(revision.revision)))
        if (orderBy?.revision === 'desc') found.sort((left, right) => right.revision - left.revision)
        return await Promise.resolve(found)
      },
      findUnique: async ({ where }: {
        where: { workflowId_revision: { workflowId: string; revision: number } }
      }) => await Promise.resolve(revisions.find(revision => (
        revision.workflowId === where.workflowId_revision.workflowId
        && revision.revision === where.workflowId_revision.revision
      )) ?? null)
    }
    const transaction = { workflow: workflowDelegate, workflowRevision: workflowRevisionDelegate }
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => await Promise.resolve({
          id: where.id,
          name: where.id === ownerId ? 'Owner' : 'Other',
          groups: where.id === ownerId ? ['bot'] : [],
          wikiId: 1n,
          token: {},
          createdAt,
          updatedAt: createdAt
        })
      },
      ...transaction,
      $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>): Promise<T> => (
        await callback(transaction)
      )
    }
    const redis = {
      get: async () => await Promise.resolve(null),
      zrevrange: async () => await Promise.resolve(redisInstances.map((_, index) => `instance-${index}`)),
      mget: async () => await Promise.resolve(redisInstances),
      del: async () => await Promise.resolve(0)
    }
    const notification = {
      sendMessage: async () => {
        await Promise.resolve()
      }
    }
    diContainer.register({
      prisma: asValue(prisma as unknown as PrismaClient),
      redis: asValue(redis as unknown as Redis),
      notification: asValue(notification as unknown as Notification)
    })

    await app.register(fastifyAwilixPlugin)
    app.decorateRequest('user', null)
    app.decorateRequest('session')
    app.addHook('onRequest', async (request) => {
      await Promise.resolve()
      const header = request.headers['x-test-user']
      // oxlint-disable-next-line typescript/consistent-type-assertions, no-param-reassign -- test session stub
      request.session = { userId: typeof header === 'string' ? header : undefined } as FastifyRequest['session']
    })
    await app.register(workflowRoutes)
    await app.register(workflowVersionRoutes)
    await app.ready()
  })

  after(async () => {
    await app.close()
  })

  void test('appends updates, diffs revisions, and rolls back by creating a new revision', async () => {
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/workflow/${workflowId}`,
      headers: { 'x-test-user': ownerId },
      payload: { name: 'Changed workflow', expectedRevision: 1 }
    })
    equal(updated.statusCode, 200)
    equal(updated.json<{ workflow: { currentRevision: number } }>().workflow.currentRevision, 2)

    const stale = await app.inject({
      method: 'PUT',
      url: `/api/workflow/${workflowId}`,
      headers: { 'x-test-user': ownerId },
      payload: { name: 'Stale overwrite', expectedRevision: 1 }
    })
    equal(stale.statusCode, 409)

    const diff = await app.inject({
      method: 'GET',
      url: `/api/workflow/${workflowId}/revisions/diff?from=1&to=2`,
      headers: { 'x-test-user': ownerId }
    })
    equal(diff.statusCode, 200)
    deepEqual(diff.json<{ changes: Array<{ path: string; kind: string }> }>().changes, [{
      path: '/name',
      kind: 'changed',
      before: 'Versioned workflow',
      after: 'Changed workflow'
    }])

    const rolledBack = await app.inject({
      method: 'POST',
      url: `/api/workflow/${workflowId}/revisions/1/rollback`,
      headers: { 'x-test-user': ownerId }
    })
    equal(rolledBack.statusCode, 200)
    const workflow = workflows.get(workflowId)
    ok(workflow !== undefined)
    equal(workflow.name, 'Versioned workflow')
    equal(workflow.currentRevision, 3)
    const rollbackRevision = revisions.find(revision => revision.workflowId === workflowId && revision.revision === 3)
    ok(rollbackRevision !== undefined)
    equal(rollbackRevision.changeKind, 'ROLLBACK')
    equal(rollbackRevision.sourceRevision, 1)
  })

  void test('duplicates disabled, exports/imports, and deletes workflows', async () => {
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/workflow/${workflowId}/duplicate`,
      headers: { 'x-test-user': ownerId },
      payload: {}
    })
    equal(duplicate.statusCode, 200)
    const duplicateId = duplicate.json<{ workflow: { id: string; enabled: boolean } }>().workflow.id
    equal(duplicate.json<{ workflow: { enabled: boolean } }>().workflow.enabled, false)

    const exported = await app.inject({
      method: 'GET',
      url: `/api/workflow/${workflowId}/export`,
      headers: { 'x-test-user': ownerId }
    })
    equal(exported.statusCode, 200)
    equal(exported.json<{ formatVersion: number }>().formatVersion, 1)

    const imported = await app.inject({
      method: 'POST',
      url: '/api/workflow/import',
      headers: { 'x-test-user': ownerId },
      payload: exported.json()
    })
    equal(imported.statusCode, 200)
    const importedId = imported.json<{ workflow: { id: string } }>().workflow.id
    ok(revisions.some(revision => revision.workflowId === importedId && revision.changeKind === 'IMPORT'))

    redisInstances = [JSON.stringify({
      workflowId: duplicateId,
      instanceId: '00000000-0000-4000-8000-000000000030',
      firstJobId: '00000000-0000-4000-8000-000000000031',
      status: 'pending',
      createdAt: Date.now(),
      context: {},
      steps: []
    })]
    const activeDelete = await app.inject({
      method: 'DELETE',
      url: `/api/workflow/${duplicateId}`,
      headers: { 'x-test-user': ownerId }
    })
    equal(activeDelete.statusCode, 409)
    redisInstances = []

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/workflow/${duplicateId}`,
      headers: { 'x-test-user': ownerId }
    })
    equal(deleted.statusCode, 200)
    equal(workflows.has(duplicateId), false)
    equal(revisions.some(revision => revision.workflowId === duplicateId), false)
  })

  void test('does not expose private revision history to other users', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/workflow/${workflowId}/revisions`,
      headers: { 'x-test-user': otherId }
    })
    equal(response.statusCode, 403)
  })
})

void test('workflow revision migration backfills existing workflows without replacing live columns', async () => {
  const migration = await readFile(new URL(
    '../../klinklang-prisma/prisma/migrations/20260814190000_workflow_revisions/migration.sql',
    import.meta.url
  ), 'utf8')
  match(migration, /ADD COLUMN "currentRevision" INTEGER NOT NULL DEFAULT 1/v)
  match(migration, /INSERT INTO "WorkflowRevision"/v)
  match(migration, /FROM "Workflow"/v)
  equal(migration.includes('DROP COLUMN "definition"'), false)
})
