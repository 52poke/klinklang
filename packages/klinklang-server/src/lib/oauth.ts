import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import OAuth from 'oauth-1.0a'
import type { Config } from './config.js'

export interface OAuthIdentity {
  iss: string
  sub: number
  aud: string
  exp: number
  iat: number
  nonce: string
  username: string
  editcount: number
  confirmed_email: boolean
  blocked: boolean
  registered: string
  groups: string[]
  rights: string[]
  grants: string[]
}

export class MediaWikiOAuth {
  readonly oauth: OAuth
  readonly #requestTokenURL: string
  readonly #accessTokenURL: string
  readonly #userAuthorizationURL: string
  readonly #callbackURL: string
  readonly #identifyURL: string

  constructor ({ config }: { config: Config }) {
    this.oauth = new OAuth({
      consumer: {
        key: config.get('mediawiki').oauthKey,
        secret: config.get('mediawiki').oauthSecret
      },
      signature_method: 'HMAC-SHA1',
      hash_function: (baseString, key) => crypto.createHmac('sha1', key).update(baseString).digest('base64')
    })

    this.#requestTokenURL = config.get('mediawiki').scriptPath + 'index.php?title=Special:OAuth/initiate'
    this.#accessTokenURL = config.get('mediawiki').scriptPath + 'index.php?title=Special:OAuth/token'
    this.#userAuthorizationURL = config.get('mediawiki').scriptPath + 'index.php?title=Special:OAuth/authorize'
    this.#callbackURL = config.get('mediawiki').oauthCallback
    this.#identifyURL = config.get('mediawiki').scriptPath + 'index.php?title=Special:OAuth/identify'
  }

  async fetch (
    url: string,
    { body, method = 'GET', token }: { body?: BodyInit; method?: string; token?: OAuth.Token } = {}
  ): Promise<Response> {
    const headers = this.oauth.toHeader(this.oauth.authorize({
      url: url.toString(),
      data: body,
      method
    }, token))

    const response = await fetch(url.toString(), {
      headers: { ...headers }
    })

    if (response.status >= 300 || response.status < 200) {
      throw new Error(await response.text())
    }

    return response
  }

  async getToken (): Promise<OAuth.Token> {
    const url = new URL(this.#requestTokenURL)
    url.searchParams.append('oauth_callback', this.#callbackURL)

    const response = await this.fetch(url.toString())
    const params = new URLSearchParams(await response.text())
    return {
      key: params.get('oauth_token') ?? '',
      secret: params.get('oauth_token_secret') ?? ''
    }
  }

  async getRedirectURL (): Promise<{ url: string; token: OAuth.Token }> {
    const token = await this.getToken()
    const url = new URL(this.#userAuthorizationURL)
    url.searchParams.append('oauth_consumer_key', this.oauth.consumer.key)
    url.searchParams.append('oauth_token', token.key)
    return {
      url: url.toString(),
      token
    }
  }

  async verify (verifier: string, token: OAuth.Token): Promise<OAuth.Token> {
    const url = new URL(this.#accessTokenURL)
    url.searchParams.append('oauth_verifier', verifier)

    const response = await this.fetch(url.toString(), { token })
    const params = new URLSearchParams(await response.text())
    return {
      key: params.get('oauth_token') ?? '',
      secret: params.get('oauth_token_secret') ?? ''
    }
  }

  async getIdentity (token: OAuth.Token): Promise<OAuthIdentity> {
    const response = await this.fetch(this.#identifyURL, { token })
    const text = await response.text()
    return jwt.verify(text, this.oauth.consumer.secret, {
      algorithms: ['HS256'],
      audience: this.oauth.consumer.key
    }) as unknown as OAuthIdentity
  }
}
