import { type FastifyPluginAsync } from 'fastify'
import userMiddleware from '../middlewares/user.js'
import { outputUser } from '../models/user.js'

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/user/me', { preHandler: userMiddleware(false) }, async (request, reply) => {
    await reply.send({
      user: request.user != null ? outputUser(request.user) : null
    })
  })

  fastify.delete<{ Params: { fediAccountId: string } }>('/api/fedi-account/:fediAccountId', {
    preHandler: userMiddleware(false)
  }, async (request, reply) => {
    if (request.user === null) {
      throw new Error('User is not logged in')
    }
    const { fediAccountId } = request.params
    const { fediverseService } = fastify.diContainer.cradle

    await fediverseService.revoke(request.user.id, fediAccountId)
    await reply.send({})
  })
}

export default userRoutes
