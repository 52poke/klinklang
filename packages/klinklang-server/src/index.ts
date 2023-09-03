import { join } from 'path'
import { fastify } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifySession from '@fastify/session'
import fastifyStatic from '@fastify/static'
import { diContainer, fastifyAwilixPlugin } from '@fastify/awilix'
import oauth from './routes/oauth.js'
import userRoutes from './routes/user.js'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import workflowRoutes from './routes/workflow.js'
import terminologyRoutes from './routes/terminology.js'
import bootstrap from './commands/bootstrap.js'
import { start } from './lib/eventbus.js'
import { register } from './lib/register.js'
import patchBigInt from './lib/ext.js'

const launch = async (): Promise<void> => {
  await register()
  const { config, discordClient, prisma, notification, logger, worker } = diContainer.cradle
  try {
    if (config.get('discord').token !== '') {
      await discordClient.login(config.get('discord').token)
    }
  } catch (e) {
    logger.error('discord login failed', e)
    throw e
  }

  await bootstrap({ config, prisma })
  await start({ config, prisma, notification, logger })
  worker.run().catch(e => { logger.error(e) })
  patchBigInt()

  const { host, port } = config.get('app')
  const workspaceRoot = await findWorkspaceDir(process.cwd())
  const buildPath = join(workspaceRoot !== undefined ? `${workspaceRoot}/packages/klinklang-client` : '.', 'build')
  const server = fastify({ logger })

  await server.register(fastifyCookie)
  await server.register(fastifySession, {
    secret: config.get('app').secret,
    cookie: { secure: process.env.NODE_ENV === 'production' }
  })

  await server.register(fastifyAwilixPlugin)

  server.decorateRequest('user', null)
  await server.register(oauth)
  await server.register(userRoutes)
  await server.register(workflowRoutes)
  await server.register(terminologyRoutes)

  await server.register(fastifyStatic, {
    root: buildPath
  })

  server.setNotFoundHandler(async (request, reply) => {
    await reply.sendFile('index.html')
  })

  await server.listen({ host, port })
  logger.info(`Klinklang server listening on ${port}`)
}

process.on('unhandledRejection', (err) => {
  console.log(err)
  process.exit(1)
})

launch().catch(e => {
  console.log(e)
})
