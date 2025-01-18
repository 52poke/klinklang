import type { FediAccount, FediInstance } from '@mudkipme/klinklang-prisma'
import { createOAuthAPIClient, createRestAPIClient } from 'masto'
import type { Logger } from 'pino'
import type { Config } from '../lib/config.ts'
import type { PrismaClient } from '../lib/database.ts'

function urlToDomain (url: string): string {
  if (!url.includes('://')) {
    url = 'https://' + url
  }
  return new URL(url).hostname
}

export class FediverseService {
  readonly #prisma: PrismaClient
  readonly #config: Config
  readonly #logger: Logger

  constructor ({ prisma, config, logger }: { prisma: PrismaClient; config: Config; logger: Logger }) {
    this.#prisma = prisma
    this.#config = config
    this.#logger = logger
  }

  #redirectURI (domain: string): string {
    return this.#config.get('app.url') + '/fedi/callback/' + domain
  }

  redirectURL (instance: FediInstance): string {
    return `https://${instance.domain}/oauth/authorize?client_id=${instance.clientID}&response_type=code&redirect_uri=${
      encodeURIComponent(this.#redirectURI(instance.domain))
    }&scope=read+write`
  }

  async createApp (url: string): Promise<FediInstance> {
    const domain = urlToDomain(url)
    const client = createRestAPIClient({
      url: 'https://' + domain
    })
    const redirectUri = this.#redirectURI(domain)

    const fediInstance = await this.#prisma.fediInstance.findUnique({ where: { domain } })
    if (fediInstance !== null) {
      // Some Mastodon-compatible apps (GoToSocial) don't support `/api/v1/apps/verify_creditionals`
      //
      // const oauthClient = createOAuthAPIClient({
      //   url: 'https://' + domain
      // })
      // const token = await oauthClient.token.create({
      //   clientId: fediInstance.clientID,
      //   clientSecret: fediInstance.clientSecret,
      //   redirectUri,
      //   grantType: 'client_credentials'
      // })

      // const appClient = createRestAPIClient({
      //   url: 'https://' + domain,
      //   accessToken: token.accessToken
      // })
      // await appClient.v1.apps.verifyCredentials()
      return fediInstance
    }

    const instance = await client.v2.instance.fetch()
    const resp = await client.v1.apps.create({
      clientName: 'Klinklang',
      scopes: 'read write',
      redirectUris: redirectUri
    })

    if (
      resp.clientId === null || resp.clientSecret === null || resp.clientId === undefined
      || resp.clientSecret === undefined
    ) {
      throw new Error('Failed to create app')
    }

    return await this.#prisma.fediInstance.create({
      data: {
        name: instance.title,
        domain,
        clientID: resp.clientId,
        clientSecret: resp.clientSecret
      }
    })
  }

  async authorize (userId: string, domain: string, code: string): Promise<FediAccount> {
    const fediInstance = await this.#prisma.fediInstance.findUnique({ where: { domain } })
    if (fediInstance === null) {
      throw new Error('Invalid domain')
    }

    const oauthClient = createOAuthAPIClient({
      url: 'https://' + domain
    })
    const token = await oauthClient.token.create({
      clientId: fediInstance.clientID,
      clientSecret: fediInstance.clientSecret,
      grantType: 'authorization_code',
      code,
      redirectUri: this.#redirectURI(domain),
      scope: 'read write'
    })

    const client = createRestAPIClient({
      url: 'https://' + domain,
      accessToken: token.accessToken
    })
    const account = await client.v1.accounts.verifyCredentials()
    const subject = '@' + account.username + '@' + domain

    return await this.#prisma.fediAccount.upsert({
      where: { subject, userId },
      create: {
        userId,
        fediInstanceId: fediInstance.id,
        subject,
        accessToken: token.accessToken
      },
      update: {
        accessToken: token.accessToken
      }
    })
  }

  async revoke (userId: string, fediAccountId: string): Promise<void> {
    const fediAccount = await this.#prisma.fediAccount.findUnique({
      where: { id: fediAccountId },
      include: { fediInstance: true }
    })
    if (fediAccount === null) {
      return
    }

    try {
      await fetch('https://' + fediAccount.fediInstance.domain + '/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: fediAccount.fediInstance.clientID,
          client_secret: fediAccount.fediInstance.clientSecret,
          token: fediAccount.accessToken
        })
      })
    } catch (e) {
      this.#logger.error(e)
    }

    await this.#prisma.fediAccount.delete({
      where: { id: fediAccountId, userId }
    })
  }

  async getClient (userId: string, subject: string): Promise<ReturnType<typeof createRestAPIClient>> {
    const fediAccount = await this.#prisma.fediAccount.findUnique({
      where: { subject, userId },
      include: { fediInstance: true }
    })
    if (fediAccount === null) {
      throw new Error('Invalid account')
    }

    return createRestAPIClient({
      url: 'https://' + fediAccount.fediInstance.domain,
      accessToken: fediAccount.accessToken
    })
  }
}
