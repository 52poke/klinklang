import type { User } from '@mudkipme/klinklang-prisma'
import type { Queue, Worker } from 'bullmq'
import type { Client } from 'discord.js'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import type { Config } from '../lib/config.js'
import type { PrismaClient } from '../lib/database.js'
import type { Notification } from '../lib/notification.js'
import type { MediaWikiOAuth } from '../lib/oauth.js'
import type { FediverseService } from '../services/fediverse.ts'
import type { TerminologyService } from '../services/terminology.js'
import type { WikiService } from '../services/wiki.js'

declare module 'fastify' {
  interface Session {
    loginToken?: Token
    userId?: string
  }

  interface FastifyRequest {
    user: User | null
  }
}

declare module '@fastify/awilix' {
  interface Cradle {
    config: Config
    prisma: PrismaClient
    wikiService: WikiService
    mediaWikiOAuth: MediaWikiOAuth
    redis: Redis
    subscriberRedis: Redis
    notification: Notification
    terminologyService: TerminologyService
    discordClient: Client
    worker: Worker
    queue: Queue
    logger: Logger
    fediverseService: FediverseService
  }
}

export {}
