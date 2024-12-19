import type { FastifyPluginCallback } from 'fastify'
import userMiddleware from '../middlewares/user.js'

export const fediRoutes: FastifyPluginCallback = (fastify) => {
  fastify.post<{ Body: { domain: string } }>('/fedi/login', {
    preHandler: userMiddleware(true)
  }, async (request, reply) => {
    const { fediverseService } = fastify.diContainer.cradle
    const { domain } = request.body

    const fediInstance = await fediverseService.createApp(domain)
    await reply.send({
      redirectURL: fediverseService.redirectURL(fediInstance)
    })
  })

  fastify.get<{ Params: { domain: string }; Querystring: { code: string } }>('/fedi/callback/:domain', {
    preHandler: userMiddleware(true)
  }, async (request, reply) => {
    if (request.user === null) {
      throw new Error('User is not logged in')
    }
    const { fediverseService } = fastify.diContainer.cradle
    const { domain } = request.params
    const { code } = request.query

    await fediverseService.authorize(request.user.id, domain, code)
    await reply.redirect('/pages/settings')
  })
}
