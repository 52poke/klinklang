import type { Job } from 'bullmq'
import type { ZodType } from 'zod'
import type { WorkerType } from './base.ts'
import { DiscordMessageWorker, discordMessageInputSchema, discordMessageOutputSchema } from './discord.ts'
import { FediPostWorker, fediPostInputSchema, fediPostOutputSchema } from './fedi.ts'
import type { ActionJobData, ActionJobResult, Actions } from './interfaces.ts'
import { RequestWorker, requestInputSchema, requestOutputSchema } from './request.ts'
import { SCSSWorker, scssInputSchema, scssOutputSchema } from './scss.ts'
import { RegexWorker, regexpInputSchema, regexpOutputSchema } from './string.ts'
import {
  ParseTerminologyWorker,
  UpdateTerminologyWorker,
  parseTerminologyInputSchema,
  parseTerminologyOutputSchema,
  updateTerminologyInputSchema,
  updateTerminologyOutputSchema
} from './terminology.ts'
import {
  EditWikiWorker,
  GetHTMLWorker,
  GetTextWorker,
  editWikiInputSchema,
  editWikiOutputSchema,
  getHTMLInputSchema,
  getHTMLOutputSchema,
  getTextInputSchema,
  getTextOutputSchema
} from './wiki.ts'

interface ActionRegistration<T extends Actions> {
  processor: WorkerType<T>
  inputSchema: ZodType
  outputSchema: ZodType
}

interface ActionRegisterMap {
  set: <T extends Actions>(key: T['actionType'], value: ActionRegistration<T>) => void
  get: <T extends Actions>(key: T['actionType']) => ActionRegistration<T> | undefined
}

const actionRegisterMap: ActionRegisterMap = new Map()

export async function processAction<T extends Actions> (
  job: Job<ActionJobData<T>, ActionJobResult<T>>
): Promise<ActionJobResult<T>> {
  const registration = actionRegisterMap.get(job.data.actionType)
  if (registration === undefined) {
    throw new Error('UNKNOWN_ACTION_TYPE')
  }
  registration.inputSchema.parse(job.data.input)
  const Processor = registration.processor
  const processor = new Processor(job)
  return await processor.handleJob(registration.outputSchema)
}

export function validateActionInput (actionType: Actions['actionType'], input: unknown): string[] {
  const registration = actionRegisterMap.get(actionType)
  if (registration === undefined) {
    return ['unknown action type']
  }
  const parsed = registration.inputSchema.safeParse(input)
  if (parsed.success) {
    return []
  }
  return parsed.error.issues.map(issue => {
    const path = issue.path.length === 0 ? 'input' : issue.path.join('.')
    return `${path}: ${issue.message}`
  })
}

export function register<T extends Actions> (
  actionType: T['actionType'],
  processor: WorkerType<T>,
  inputSchema: ZodType,
  outputSchema: ZodType
): void {
  actionRegisterMap.set(actionType, { processor, inputSchema, outputSchema })
}

register('GET_HTML', GetHTMLWorker, getHTMLInputSchema, getHTMLOutputSchema)
register('PARSE_TERMINOLOGY_LIST', ParseTerminologyWorker, parseTerminologyInputSchema, parseTerminologyOutputSchema)
register('UPDATE_TERMINOLOGY', UpdateTerminologyWorker, updateTerminologyInputSchema, updateTerminologyOutputSchema)
register('GET_TEXT', GetTextWorker, getTextInputSchema, getTextOutputSchema)
register('EDIT_WIKI', EditWikiWorker, editWikiInputSchema, editWikiOutputSchema)
register('REGEXP_MATCH', RegexWorker, regexpInputSchema, regexpOutputSchema)
register('SCSS_COMPILE', SCSSWorker, scssInputSchema, scssOutputSchema)
register('DISCORD_MESSAGE', DiscordMessageWorker, discordMessageInputSchema, discordMessageOutputSchema)
register('REQUEST', RequestWorker, requestInputSchema, requestOutputSchema)
register('FEDI_POST', FediPostWorker, fediPostInputSchema, fediPostOutputSchema)
