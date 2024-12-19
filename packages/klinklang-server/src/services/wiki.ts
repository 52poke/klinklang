import type { User } from '@mudkipme/klinklang-prisma'
import type { Token } from 'oauth-1.0a'
import type OAuth from 'oauth-1.0a'
import type { Config } from '../lib/config.js'
import MediaWikiClient from '../lib/mediawiki/client.js'
import type { MediaWikiOAuth } from '../lib/oauth.js'

export class WikiService {
  readonly #apiRoot: string
  readonly #oauth: OAuth
  readonly defaultClient: MediaWikiClient

  constructor ({ config, mediaWikiOAuth }: { config: Config; mediaWikiOAuth: MediaWikiOAuth }) {
    this.#apiRoot = config.get('mediawiki').scriptPath + 'api.php'
    this.#oauth = mediaWikiOAuth.oauth
    this.defaultClient = new MediaWikiClient({ apiRoot: config.get('mediawiki').scriptPath + 'api.php' })
  }

  authedClient (token: Token): MediaWikiClient {
    return new MediaWikiClient({
      apiRoot: this.#apiRoot,
      oauth: this.#oauth,
      token
    })
  }

  getWikiClientOfUser (user: User): MediaWikiClient {
    return this.authedClient(user.token as unknown as Token)
  }
}
