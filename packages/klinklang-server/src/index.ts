import { diContainer, fastifyAwilixPlugin } from '@fastify/awilix'
import fastifyCookie from '@fastify/cookie'
import fastifySession from '@fastify/session'
import fastifyStatic from '@fastify/static'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { RedisStore } from 'connect-redis'
import { fastify } from 'fastify'
import { join } from 'node:path'
import bootstrap from './commands/bootstrap.ts'
import { start } from './lib/eventbus.ts'
import patchBigInt from './lib/ext.ts'
import { register } from './lib/register.ts'
import { fediRoutes } from './routes/fedi.ts'
import oauth from './routes/oauth.ts'
import terminologyRoutes from './routes/terminology.ts'
import userRoutes from './routes/user.ts'
import workflowRoutes from './routes/workflow.ts'

const launch = async (): Promise<void> => {
  await register()
  const { config, discordClient, prisma, notification, logger, worker, redis } = diContainer.cradle
  try {
    const discordToken = config.get('discord').token
    if (discordToken.length > 0) {
      await discordClient.login(discordToken)
    }
  } catch (e) {
    logger.error({ err: e }, 'discord login failed')
    throw e as Error
  }

  await bootstrap({ config, prisma })
  await start({ config, prisma, notification, logger, redis })
  worker.run().catch((e: unknown) => {
    logger.error(e)
  })
  patchBigInt()

  const { host, port, devPort } = config.get('app')
  const workspaceRoot = await findWorkspaceDir(process.cwd())
  const buildRoot = workspaceRoot === undefined ? '.' : `${workspaceRoot}/packages/klinklang-client`
  const buildPath = join(buildRoot, 'build')
  const server = fastify({ loggerInstance: logger, trustProxy: true })

  await server.register(fastifyCookie)
  await server.register(fastifySession, {
    secret: config.get('app').secret,
    cookie: { secure: process.env.NODE_ENV === 'production' },
    store: new RedisStore({ client: redis })
  })

  await server.register(fastifyAwilixPlugin)

  server.decorateRequest('user', null)
  await server.register(oauth)
  await server.register(userRoutes)
  await server.register(workflowRoutes)
  await server.register(terminologyRoutes)
  await server.register(fediRoutes)

  await server.register(fastifyStatic, {
    root: buildPath
  })

  server.setNotFoundHandler(async (request, reply) => {
    await reply.sendFile('index.html')
  })

  const listenPort = process.env.NODE_ENV === 'production' ? port : (devPort === 0 ? port : devPort)
  await server.listen({ host, port: listenPort })
  logger.info(`Klinklang server listening on ${listenPort}`)
}

process.on('unhandledRejection', (err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})

launch().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
})
