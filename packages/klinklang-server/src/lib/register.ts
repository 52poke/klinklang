import { diContainer } from '@fastify/awilix'
import { asClass, asFunction, asValue } from 'awilix'
import { FediverseService } from '../services/fediverse.ts'
import { TerminologyService } from '../services/terminology.ts'
import { WikiService } from '../services/wiki.ts'
import { loadConfig } from './config.ts'
import { getClient as getDatabaseClient } from './database.ts'
import { getClient as getDiscordClient } from './discord.ts'
import { getLogger } from './logger.ts'
import { getNotification } from './notification.ts'
import { MediaWikiOAuth } from './oauth.ts'
import { getQueue } from './queue.ts'
import { getRedis } from './redis.ts'
import { getWorker } from './worker.ts'

export async function register (): Promise<void> {
  diContainer.register({
    config: asValue(await loadConfig()),
    prisma: asFunction(getDatabaseClient).singleton(),
    wikiService: asClass(WikiService).singleton(),
    mediaWikiOAuth: asClass(MediaWikiOAuth).singleton(),
    redis: asFunction(getRedis).singleton(),
    subscriberRedis: asFunction(getRedis).singleton(),
    notification: asFunction(getNotification).singleton(),
    terminologyService: asClass(TerminologyService).singleton().disposer(service => {
      service.dispose()
    }),
    discordClient: asFunction(getDiscordClient).singleton(),
    worker: asFunction(getWorker).singleton(),
    queue: asFunction(getQueue).singleton(),
    logger: asFunction(getLogger).singleton(),
    fediverseService: asClass(FediverseService).singleton()
  })
}
