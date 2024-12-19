import createError from '@fastify/error'
import type { Prisma } from '@mudkipme/klinklang-prisma'
import type { FastifyPluginCallback, FastifyRequest } from 'fastify'
import type { Token } from 'oauth-1.0a'

const oauthRoutes: FastifyPluginCallback = (fastify) => {
  fastify.get('/oauth/login', async (request, reply) => {
    const { url, token } = await fastify.diContainer.cradle.mediaWikiOAuth.getRedirectURL()
    request.session.loginToken = token
    await reply.redirect(url)
  })

  fastify.get(
    '/oauth/callback',
    async (request: FastifyRequest<{ Querystring: { oauth_verifier?: string } }>, reply) => {
      const { mediaWikiOAuth, prisma } = fastify.diContainer.cradle
      const verifier = request.query.oauth_verifier
      if (request.session.loginToken === undefined || verifier === undefined) {
        throw createError('INVALID_OAUTH_CALLBACK', 'invalid oauth callback', 400)()
      }

      const token = await mediaWikiOAuth.verify(verifier, request.session.loginToken as Token)
      delete request.session.loginToken

      const identity = await mediaWikiOAuth.getIdentity(token)
      let user = await prisma.user.findUnique({ where: { wikiId: identity.sub } })
      if (user === null) {
        user = await prisma.user.create({
          data: {
            wikiId: identity.sub,
            token: token as unknown as Prisma.InputJsonValue,
            groups: identity.groups,
            name: identity.username
          }
        })
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            token: token as unknown as Prisma.InputJsonValue,
            groups: identity.groups,
            name: identity.username
          }
        })
      }

      request.session.userId = user.id
      await reply.redirect('/')
    }
  )

  fastify.post('/oauth/logout', async (request, reply) => {
    await request.session.destroy()
    await reply.redirect('/')
  })
}

export default oauthRoutes
