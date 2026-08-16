import { actionCatalogResponseSchema } from '@mudkipme/klinklang-domain'
import type { FastifyPluginCallbackZod } from '@fastify/type-provider-zod'
import { getActionCatalog } from '../actions/register.ts'
import userMiddleware from '../middlewares/user.ts'

const actionRoutes: FastifyPluginCallbackZod = (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/api/actions',
    preHandler: userMiddleware(true),
    schema: {
      response: { 200: actionCatalogResponseSchema }
    },
    handler: () => ({ actions: getActionCatalog() })
  })
}

export default actionRoutes
