import type { FastifyReply, FastifyRequest, RouteGenericInterface } from 'fastify'
import { unauthorizedError } from '../lib/errors.ts'

const userMiddleware = <T extends RouteGenericInterface>(requireLogin: boolean) =>
  async function(request: FastifyRequest<T>, reply: FastifyReply) {
    if (request.session.userId !== undefined) {
      try {
        const user = await request.diScope.resolve('prisma').user.findUnique({
          where: { id: request.session.userId },
          select: {
            id: true,
            name: true,
            wikiId: true,
            groups: true,
            createdAt: true,
            updatedAt: true,
            fediAccounts: {
              select: {
                id: true,
                subject: true
              }
            }
          }
        })
        if (user === null) {
          if (requireLogin) {
            throw unauthorizedError()
          }
        }
        // oxlint-disable-next-line no-param-reassign -- fastify request decoration
        request.user = user
      } catch (e) {
        request.log.error(e)
        throw e as Error
      }
    } else if (requireLogin) {
      throw unauthorizedError()
    }
  }

export default userMiddleware
