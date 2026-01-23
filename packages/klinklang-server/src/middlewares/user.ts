import type { FastifyReply, FastifyRequest, RouteGenericInterface } from 'fastify'
import { unauthorizedError } from '../lib/errors.ts'

const userMiddleware = <T extends RouteGenericInterface>(requireLogin: boolean) =>
  async function(request: FastifyRequest<T>, reply: FastifyReply) {
    if (request.session.userId !== undefined) {
      try {
        const user = await request.diScope.resolve('prisma').user.findUnique({
          where: { id: request.session.userId },
          include: { fediAccounts: true }
        })
        if (user === null) {
          if (requireLogin) {
            throw unauthorizedError()
          }
        }
        // eslint-disable-next-line no-param-reassign, require-atomic-updates -- fastify request decoration
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
