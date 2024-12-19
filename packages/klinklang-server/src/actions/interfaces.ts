import type { DiscordMessageAction } from './discord.js'
import type { FediPostAction } from './fedi.js'
import type { RequestAction } from './request.js'
import type { SCSSAction } from './scss.js'
import type { RegExpAction } from './string.js'
import type { ParseTerminologyListAction, UpdateTerminologyAction } from './terminology.js'
import type { EditWikiAction, GetHTMLAction, GetTextAction } from './wiki.js'

export type Actions =
  | GetHTMLAction
  | ParseTerminologyListAction
  | UpdateTerminologyAction
  | GetTextAction
  | RegExpAction
  | SCSSAction
  | EditWikiAction
  | DiscordMessageAction
  | RequestAction
  | FediPostAction

export interface ActionJobData<T extends Actions> extends Pick<T, 'actionType' | 'input'> {
  instanceId: string
  workflowId: string
  actionId: string
}

export interface ActionJobResult<T extends Actions> extends Pick<T, 'output'> {
  nextJobId?: string
}
