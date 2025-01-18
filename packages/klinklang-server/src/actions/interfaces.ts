import type { DiscordMessageAction } from './discord.ts'
import type { FediPostAction } from './fedi.ts'
import type { RequestAction } from './request.ts'
import type { SCSSAction } from './scss.ts'
import type { RegExpAction } from './string.ts'
import type { ParseTerminologyListAction, UpdateTerminologyAction } from './terminology.ts'
import type { EditWikiAction, GetHTMLAction, GetTextAction } from './wiki.ts'

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
