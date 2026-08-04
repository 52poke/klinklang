import { diContainer, fastifyAwilixPlugin } from '@fastify/awilix'
import type { PrismaClient, Workflow } from '@mudkipme/klinklang-prisma'
import { asValue } from 'awilix'
import { deepEqual, equal } from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { fastify, type FastifyInstance, type FastifyRequest } from 'fastify'
import type { Notification } from '../src/lib/notification.ts'
import workflowRoutes from '../src/routes/workflow.ts'
import userRoutes from '../src/routes/user.ts'
import type { FediverseService } from '../src/services/fediverse.ts'

const ownerId = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
const sysopId = '00000000-0000-4000-8000-000000000003'
const privateWorkflowId = '00000000-0000-4000-8000-000000000004'
const publicWorkflowId = '00000000-0000-4000-8000-000000000005'

const users = new Map([
  [ownerId, { id: ownerId, name: 'Owner', groups: ['bot'] }],
  [otherId, { id: otherId, name: 'Other', groups: [] }],
  [sysopId, { id: sysopId, name: 'Sysop', groups: ['sysop'] }]
])

const workflow = (id: string, isPrivate: boolean, userId: string | null): Workflow => ({
  id,
  name: isPrivate ? 'Private workflow' : 'Public workflow',
  isPrivate,
  enabled: true,
  triggers: [{ type: 'TRIGGER_MANUAL' }],
  definition: { StartAt: 'Done', States: { Done: { Type: 'Succeed' } } },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  userId
})

const privateWorkflow = workflow(privateWorkflowId, true, ownerId)
const publicWorkflow = workflow(publicWorkflowId, false, ownerId)
const workflows = new Map([
  [privateWorkflow.id, privateWorkflow],
  [publicWorkflow.id, publicWorkflow]
])

void describe('workflow route authorization', () => {
  const app: FastifyInstance = fastify()
  let listQuery: unknown = null
  let updateCount = 0
  let revokedAccount: { userId: string; accountId: string } | null = null

  before(async () => {
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          await Promise.resolve()
          const user = users.get(where.id)
          if (user === undefined) {
            return null
          }
          return {
            ...user,
            wikiId: 1n,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
            fediAccounts: []
          }
        }
      },
      workflow: {
        findMany: async (query: unknown) => {
          await Promise.resolve()
          listQuery = query
          return [publicWorkflow]
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          await Promise.resolve()
          return workflows.get(where.id) ?? null
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<Workflow> }) => {
          await Promise.resolve()
          updateCount += 1
          return { ...workflows.get(where.id), ...data }
        }
      }
    }
    const notification = {
      sendMessage: async () => {
        await Promise.resolve()
      }
    }
    const fediverseService = {
      revoke: async (userId: string, accountId: string) => {
        await Promise.resolve()
        revokedAccount = { userId, accountId }
      }
    }
    diContainer.register({
      prisma: asValue(prisma as unknown as PrismaClient),
      notification: asValue(notification as unknown as Notification),
      fediverseService: asValue(fediverseService as unknown as FediverseService)
    })

    await app.register(fastifyAwilixPlugin)
    app.decorateRequest('user', null)
    app.decorateRequest('session')
    app.addHook('onRequest', async (request) => {
      await Promise.resolve()
      const header = request.headers['x-test-user']
      const userId = typeof header === 'string' ? header : undefined
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, no-param-reassign -- test session stub
      request.session = { userId } as FastifyRequest['session']
    })
    await app.register(workflowRoutes)
    await app.register(userRoutes)
    await app.ready()
  })

  after(async () => {
    await app.close()
  })

  void test('rejects unauthenticated workflow requests', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/workflow' })

    equal(response.statusCode, 401)
  })

  void test('limits authenticated listings to public and owned workflows', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflow?offset=3&limit=10',
      headers: { 'x-test-user': otherId }
    })

    equal(response.statusCode, 200)
    deepEqual(listQuery, {
      skip: 3,
      take: 10,
      where: {
        OR: [
          { isPrivate: false },
          { userId: otherId }
        ]
      }
    })
  })

  void test('allows only the owner to read a private workflow', async () => {
    const denied = await app.inject({
      method: 'GET',
      url: `/api/workflow/${privateWorkflowId}/actions`,
      headers: { 'x-test-user': otherId }
    })
    const allowed = await app.inject({
      method: 'GET',
      url: `/api/workflow/${privateWorkflowId}/actions`,
      headers: { 'x-test-user': ownerId }
    })

    equal(denied.statusCode, 403)
    equal(allowed.statusCode, 200)
  })

  void test('allows sysops to update public workflows but not another user private workflow', async () => {
    const deniedPublic = await app.inject({
      method: 'PUT',
      url: `/api/workflow/${publicWorkflowId}`,
      headers: { 'x-test-user': otherId },
      payload: { name: 'Denied' }
    })
    const allowedPublic = await app.inject({
      method: 'PUT',
      url: `/api/workflow/${publicWorkflowId}`,
      headers: { 'x-test-user': sysopId },
      payload: { name: 'Updated' }
    })
    const deniedPrivate = await app.inject({
      method: 'PUT',
      url: `/api/workflow/${privateWorkflowId}`,
      headers: { 'x-test-user': sysopId },
      payload: { name: 'Denied' }
    })

    equal(deniedPublic.statusCode, 403)
    equal(allowedPublic.statusCode, 200)
    equal(deniedPrivate.statusCode, 403)
    equal(updateCount, 1)
  })

  void test('requires login for account revocation and scopes it to the authenticated user', async () => {
    const unauthenticated = await app.inject({
      method: 'DELETE',
      url: '/api/fedi-account/account-1'
    })
    const authenticated = await app.inject({
      method: 'DELETE',
      url: '/api/fedi-account/account-1',
      headers: { 'x-test-user': ownerId }
    })

    equal(unauthenticated.statusCode, 401)
    equal(authenticated.statusCode, 200)
    deepEqual(revokedAccount, { userId: ownerId, accountId: 'account-1' })
  })
})
