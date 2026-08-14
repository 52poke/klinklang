import { diContainer, fastifyAwilixPlugin } from '@fastify/awilix'
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'
import type { PrismaClient, Workflow } from '@mudkipme/klinklang-prisma'
import { asValue } from 'awilix'
import { deepEqual, equal } from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { fastify, type FastifyInstance, type FastifyRequest } from 'fastify'
import type { Redis } from 'ioredis'
import { httpErrorHandler } from '../src/lib/http-errors.ts'
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

const privateWorkflow: Workflow = {
  ...workflow(privateWorkflowId, true, ownerId),
  definition: {
    StartAt: 'Check',
    States: {
      Check: {
        Type: 'Choice',
        Choices: [{ Variable: '$.ready', BooleanEquals: true, Next: 'Done' }],
        Default: 'Done'
      },
      Done: { Type: 'Succeed' }
    }
  }
}
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
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    app.setErrorHandler(httpErrorHandler)
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
    const redis = {
      get: async () => await Promise.resolve(null)
    }
    diContainer.register({
      prisma: asValue(prisma as unknown as PrismaClient),
      notification: asValue(notification as unknown as Notification),
      fediverseService: asValue(fediverseService as unknown as FediverseService),
      redis: asValue(redis as unknown as Redis)
    })

    await app.register(fastifyAwilixPlugin)
    app.decorateRequest('user', null)
    app.decorateRequest('session')
    app.addHook('onRequest', async (request) => {
      await Promise.resolve()
      const header = request.headers['x-test-user']
      const userId = typeof header === 'string' ? header : undefined
      // oxlint-disable-next-line typescript/consistent-type-assertions, no-param-reassign -- test session stub
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

  void test('validates and caps workflow list pagination at the HTTP boundary', async () => {
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/workflow?offset=-1',
      headers: { 'x-test-user': otherId }
    })
    const capped = await app.inject({
      method: 'GET',
      url: '/api/workflow?limit=999999',
      headers: { 'x-test-user': otherId }
    })

    equal(invalid.statusCode, 400)
    equal(invalid.json<{ error: string }>().error, 'INVALID_REQUEST')
    equal(capped.statusCode, 200)
    deepEqual(listQuery, {
      skip: 0,
      take: 200,
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

  void test('rejects malformed workflow params and bodies before route execution', async () => {
    const invalidParams = await app.inject({
      method: 'GET',
      url: '/api/workflow/not-a-uuid/actions',
      headers: { 'x-test-user': ownerId }
    })
    const invalidBody = await app.inject({
      method: 'PUT',
      url: `/api/workflow/${privateWorkflowId}`,
      headers: { 'x-test-user': ownerId },
      payload: { name: '' }
    })

    equal(invalidParams.statusCode, 400)
    equal(invalidBody.statusCode, 400)
    equal(invalidParams.json<{ error: string }>().error, 'INVALID_REQUEST')
    equal(invalidBody.json<{ error: string }>().error, 'INVALID_REQUEST')
    equal(updateCount, 0)
  })

  void test('keeps semantic workflow validation errors distinct from request shape errors', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/workflow/${privateWorkflowId}`,
      headers: { 'x-test-user': ownerId },
      payload: {
        definition: {
          StartAt: 'Missing',
          States: { Done: { Type: 'Succeed' } }
        }
      }
    })

    equal(response.statusCode, 400)
    equal(response.json<{ error: string }>().error, 'INVALID_WORKFLOW')
    equal(updateCount, 0)
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

  void test('protects execution inspection and control endpoints', async () => {
    const missingInstanceId = '00000000-0000-4000-8000-000000000099'
    const deniedRetry = await app.inject({
      method: 'POST',
      url: `/api/workflow/${privateWorkflowId}/instances/${missingInstanceId}/retry`,
      headers: { 'x-test-user': otherId }
    })
    const deniedCancel = await app.inject({
      method: 'POST',
      url: `/api/workflow/${privateWorkflowId}/instances/${missingInstanceId}/cancel`,
      headers: { 'x-test-user': sysopId }
    })
    const ownerInspection = await app.inject({
      method: 'GET',
      url: `/api/workflow/${privateWorkflowId}/instances/${missingInstanceId}`,
      headers: { 'x-test-user': ownerId }
    })

    equal(deniedRetry.statusCode, 403)
    equal(deniedCancel.statusCode, 403)
    equal(ownerInspection.statusCode, 404)
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
