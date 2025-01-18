import { diContainer } from '@fastify/awilix'
import type { EditRequest, EditResponse } from '../lib/mediawiki/api.ts'
import type MediaWikiClient from '../lib/mediawiki/client.ts'
import { ActionWorker } from './base.ts'
import type { Actions } from './interfaces.ts'

export interface GetHTMLActionInput {
  title: string
  variants?: Array<'zh-hans' | 'zh-hant'>
}

export interface GetHTMLActionOutput {
  text: string
  variants?: { 'zh-hans'?: string; 'zh-hant'?: string }
}

export interface GetHTMLAction {
  actionType: 'GET_HTML'
  input: GetHTMLActionInput
  output: GetHTMLActionOutput
}

export abstract class WikiWorker<T extends Actions> extends ActionWorker<T> {
  readonly #wikiClient?: MediaWikiClient
  protected async getWikiClient (): Promise<MediaWikiClient> {
    const { wikiService } = diContainer.cradle

    if (this.#wikiClient !== undefined) {
      return this.#wikiClient
    }
    const workflow = await this.getWorkflow()
    if (workflow?.user === undefined || workflow.user === null) {
      return wikiService.defaultClient
    }
    return wikiService.getWikiClientOfUser(workflow.user)
  }
}

export class GetHTMLWorker extends WikiWorker<GetHTMLAction> {
  public async process (): Promise<GetHTMLActionOutput> {
    const client = await this.getWikiClient()
    const promise = client.parse(this.input.title)
    const hansPromise = this.input.variants?.includes('zh-hans') === true
      ? client.parse(this.input.title, 'zh-hans')
      : undefined
    const hantPromise = this.input.variants?.includes('zh-hant') === true
      ? client.parse(this.input.title, 'zh-hant')
      : undefined
    const [pageDefault, pageHant, pageHans] = await Promise.all([
      promise,
      hantPromise,
      hansPromise
    ])
    return {
      text: pageDefault.parse.text,
      variants: {
        'zh-hans': pageHans?.parse.text,
        'zh-hant': pageHant?.parse.text
      }
    }
  }
}

export interface GetTextActionInput {
  title: string
}

export interface GetTextActionOutput {
  text: string
}

export interface GetTextAction {
  actionType: 'GET_TEXT'
  input: GetTextActionInput
  output: GetTextActionOutput
}

export class GetTextWorker extends WikiWorker<GetTextAction> {
  public async process (): Promise<GetTextActionOutput> {
    const client = await this.getWikiClient()
    const response = await client.queryRevision([this.input.title])
    let text = ''
    if (
      response.query.pages.length > 0 && response.query.pages[0].revisions.length > 0
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- slots is record
      && response.query.pages[0].revisions[0].slots.main !== undefined
    ) {
      text = response.query.pages[0].revisions[0].slots.main.content
    }
    return {
      text
    }
  }
}

export type EditWikiActionInput = EditRequest
export type EditWikiActionOutput = EditResponse

export interface EditWikiAction {
  actionType: 'EDIT_WIKI'
  input: EditWikiActionInput
  output: EditWikiActionOutput
}

export class EditWikiWorker extends WikiWorker<EditWikiAction> {
  public async process (): Promise<EditWikiActionOutput> {
    const client = await this.getWikiClient()
    return await client.edit({
      bot: true,
      ...this.input
    })
  }
}
