import createError from '@fastify/error'
import type { Token } from 'oauth-1.0a'
import type OAuth from 'oauth-1.0a'
import type { EditRequest, EditResponse, ParseResponse, QueryRevisionResponse, QueryTokenResponse } from './api.ts'

export interface MediaWikiClientOptions {
  apiRoot: string
  token?: OAuth.Token
  oauth?: OAuth
}

interface RequestOptions {
  params?: URLSearchParams
  method: 'GET' | 'POST'
  form?: object
}

const mediaWikiError = createError('MEDIAWIKI_ERROR', 'MediaWiki Error')

class MediaWikiClient {
  readonly #apiRoot: string
  readonly #oauth: OAuth | undefined
  readonly #token: Token | undefined
  public constructor (options: MediaWikiClientOptions) {
    this.#apiRoot = options.apiRoot
    this.#oauth = options.oauth
    this.#token = options.token
  }

  private async makeRequest<Response> ({ params, method, form }: RequestOptions): Promise<Response> {
    const url = new URL(this.#apiRoot)

    url.searchParams.set('format', 'json')
    url.searchParams.set('formatversion', '2')

    if (params !== undefined) {
      for (const [name, value] of params) {
        url.searchParams.append(name, value)
      }
    }

    let body: BodyInit | undefined = undefined

    if (form !== undefined) {
      const formData = new URLSearchParams()
      for (const [key, value] of Object.entries(form)) {
        formData.set(key, value as string)
      }
      body = formData.toString()
    }

    let headers = this.#oauth !== undefined
      ? this.#oauth.toHeader(this.#oauth.authorize({
        url: url.toString(),
        data: form,
        method
      }, this.#token)) as unknown as Record<string, string>
      : undefined

    if (method === 'POST') {
      headers = { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    }

    const response = await fetch(url.toString(), {
      method,
      body,
      headers
    })

    if (response.status >= 300 || response.status < 200) {
      throw mediaWikiError(response.status, await response.text())
    }

    return await response.json() as Response
  }

  private async queryToken (type = 'csrf'): Promise<QueryTokenResponse> {
    const params = new URLSearchParams()
    params.set('action', 'query')
    params.set('meta', 'tokens')
    params.set('type', type)
    return await this.makeRequest({ method: 'GET', params })
  }

  public async parse (page: string, variant?: string): Promise<ParseResponse> {
    const params = new URLSearchParams()
    params.set('action', 'parse')
    params.set('page', page)
    params.set('prop', 'text')
    variant !== undefined && params.set('variant', variant)
    return await this.makeRequest({ method: 'GET', params })
  }

  public async queryRevision (titles: string[]): Promise<QueryRevisionResponse> {
    const params = new URLSearchParams()
    params.set('action', 'query')
    params.set('prop', 'revisions')
    params.set('titles', titles.join('|'))
    params.set('rvslots', '*')
    params.set('rvprop', 'content')
    return await this.makeRequest({ method: 'GET', params })
  }

  public async edit (request: EditRequest): Promise<EditResponse> {
    const token = await this.queryToken()
    const params = new URLSearchParams()
    params.set('action', 'edit')

    return await this.makeRequest({
      method: 'POST',
      params,
      form: {
        ...request,
        token: token.query.tokens.csrftoken
      }
    })
  }
}

export default MediaWikiClient
