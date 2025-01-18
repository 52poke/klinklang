import type { Job } from 'bullmq'
import type { WorkerType } from './base.ts'
import { DiscordMessageWorker } from './discord.ts'
import { FediPostWorker } from './fedi.ts'
import type { ActionJobData, ActionJobResult, Actions } from './interfaces.ts'
import { RequestWorker } from './request.ts'
import { SCSSWorker } from './scss.ts'
import { RegexWorker } from './string.ts'
import { ParseTerminologyWorker, UpdateTerminologyWorker } from './terminology.ts'
import { EditWikiWorker, GetHTMLWorker, GetTextWorker } from './wiki.ts'

interface ActionRegisterMap {
  set: <T extends Actions>(key: T['actionType'], value: WorkerType<T>) => void
  get: <T extends Actions>(key: T['actionType']) => WorkerType<T> | null
}

const actionRegisterMap: ActionRegisterMap = new Map()

export async function processAction<T extends Actions> (
  job: Job<ActionJobData<T>, ActionJobResult<T>>
): Promise<ActionJobResult<T>> {
  const ProcessorCreator = actionRegisterMap.get(job.data.actionType)
  if (ProcessorCreator === null) {
    throw new Error('UNKNOWN_ACTION_TYPE')
  }
  const processor = new ProcessorCreator(job)
  return await processor.handleJob()
}

export function register<T extends Actions> (actionType: T['actionType'], processor: WorkerType<T>): void {
  actionRegisterMap.set(actionType, processor)
}

register('GET_HTML', GetHTMLWorker)
register('PARSE_TERMINOLOGY_LIST', ParseTerminologyWorker)
register('UPDATE_TERMINOLOGY', UpdateTerminologyWorker)
register('GET_TEXT', GetTextWorker)
register('EDIT_WIKI', EditWikiWorker)
register('REGEXP_MATCH', RegexWorker)
register('SCSS_COMPILE', SCSSWorker)
register('DISCORD_MESSAGE', DiscordMessageWorker)
register('REQUEST', RequestWorker)
register('FEDI_POST', FediPostWorker)
