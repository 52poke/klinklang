import type { FastifyPluginCallback } from 'fastify'
import userMiddleware from '../middlewares/user.ts'
import type { TranslateInput } from '../services/translation.ts'

const translateRoutes: FastifyPluginCallback = (fastify) => {
  fastify.post<{ Body: TranslateInput }>('/api/translate/stream', {
    preHandler: userMiddleware(true)
  }, async (request, reply) => {
    request.log.info({ userId: request.user?.id }, 'translate stream request received')
    const groups = request.user?.groups ?? []
    const allowed = groups.includes('sysop') || groups.includes('bot')
    if (!allowed) {
      request.log.warn({ groups }, 'translate stream forbidden')
      reply.code(403)
      return { error: 'FORBIDDEN' }
    }

    const { sourceLng, targetLng, text } = request.body
    if (text.trim() === '') {
      request.log.warn('translate stream empty text')
      reply.code(400)
      return { error: 'EMPTY_TEXT' }
    }

    request.log.info({ sourceLng, targetLng, textLength: text.length }, 'translate stream starting')
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    reply.hijack()

    try {
      for await (const chunk of fastify.diContainer.cradle.translationService.streamTranslation({
        sourceLng,
        targetLng,
        text
      })) {
        request.log.debug({ chunkLength: chunk.length }, 'translate stream chunk')
        reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
      }
      request.log.info('translate stream completed')
      reply.raw.write('data: [DONE]\n\n')
    } catch (error) {
      request.log.error({ err: error }, 'translate stream failed')
      reply.raw.write(`data: ${JSON.stringify({ error: 'TRANSLATION_FAILED' })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })
}

export default translateRoutes
