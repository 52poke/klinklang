import type { Job, JobsOptions } from 'bullmq'
import { setTimeout as delay } from 'node:timers/promises'
import { actionJsonSchema, type ActionCatalogEntry } from '@mudkipme/klinklang-domain'
import { z, type ZodType } from 'zod'
import type { WorkerType } from './base.ts'
import { DiscordMessageWorker, discordMessageInputSchema, discordMessageOutputSchema } from './discord.ts'
import { FediPostWorker, fediPostInputSchema, fediPostOutputSchema } from './fedi.ts'
import type { ActionContract, ActionJobData, ActionJobResult } from './interfaces.ts'
import { RequestWorker, requestInputSchema, requestOutputSchema } from './request.ts'
import { SCSSWorker, scssInputSchema, scssOutputSchema } from './scss.ts'
import { RegexWorker, regexpInputSchema, regexpOutputSchema } from './string.ts'
import {
  ParseTerminologyWorker,
  UpdateTerminologyWorker,
  parseTerminologyInputSchema,
  parseTerminologyOutputSchema,
  updateTerminologyInputSchema,
  updateTerminologyOutputSchema,
  type ParseTerminologyListAction,
  type UpdateTerminologyAction
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
  getTextOutputSchema,
  type EditWikiAction,
  type GetHTMLAction,
  type GetTextAction
} from './wiki.ts'
import type { DiscordMessageAction } from './discord.ts'
import type { FediPostAction } from './fedi.ts'
import type { RequestAction } from './request.ts'
import type { SCSSAction } from './scss.ts'
import type { RegExpAction } from './string.ts'

export type ActionSideEffect = 'none' | 'read' | 'write'
export type ActionIdempotency = 'idempotent' | 'conditional' | 'non-idempotent'

export interface ActionDisplayMetadata {
  label: string
  description: string
  category: 'data' | 'network' | 'notification' | 'transformation' | 'wiki'
}

export interface ActionRetryPolicy {
  attempts: number
  backoff: { type: 'fixed' | 'exponential'; delay: number }
}

export interface ActionRegistration<T extends ActionContract> {
  worker: WorkerType<T>
  inputSchema: ZodType
  outputSchema: ZodType
  display: ActionDisplayMetadata
  timeoutMs: number
  retry: ActionRetryPolicy
  sideEffect: ActionSideEffect
  idempotency: ActionIdempotency
}

function defineAction<T extends ActionContract> (registration: ActionRegistration<T>): ActionRegistration<T> {
  return registration
}

const readRetry = { attempts: 3, backoff: { type: 'exponential', delay: 1000 } } as const
const localRetry = { attempts: 2, backoff: { type: 'fixed', delay: 250 } } as const
const noRetry = { attempts: 1, backoff: { type: 'fixed', delay: 0 } } as const

export const actionRegistry = {
  GET_HTML: defineAction<GetHTMLAction>({
    worker: GetHTMLWorker,
    inputSchema: getHTMLInputSchema,
    outputSchema: getHTMLOutputSchema,
    display: { label: 'Get wiki HTML', description: 'Fetch parsed HTML for a wiki page.', category: 'wiki' },
    timeoutMs: 30_000,
    retry: readRetry,
    sideEffect: 'read',
    idempotency: 'idempotent'
  }),
  PARSE_TERMINOLOGY_LIST: defineAction<ParseTerminologyListAction>({
    worker: ParseTerminologyWorker,
    inputSchema: parseTerminologyInputSchema,
    outputSchema: parseTerminologyOutputSchema,
    display: { label: 'Parse terminology', description: 'Extract terminology entries from HTML.', category: 'transformation' },
    timeoutMs: 15_000,
    retry: localRetry,
    sideEffect: 'none',
    idempotency: 'idempotent'
  }),
  UPDATE_TERMINOLOGY: defineAction<UpdateTerminologyAction>({
    worker: UpdateTerminologyWorker,
    inputSchema: updateTerminologyInputSchema,
    outputSchema: updateTerminologyOutputSchema,
    display: { label: 'Update terminology', description: 'Replace a terminology category in storage.', category: 'data' },
    timeoutMs: 30_000,
    retry: readRetry,
    sideEffect: 'write',
    idempotency: 'idempotent'
  }),
  GET_TEXT: defineAction<GetTextAction>({
    worker: GetTextWorker,
    inputSchema: getTextInputSchema,
    outputSchema: getTextOutputSchema,
    display: { label: 'Get wiki text', description: 'Fetch source text for a wiki page.', category: 'wiki' },
    timeoutMs: 30_000,
    retry: readRetry,
    sideEffect: 'read',
    idempotency: 'idempotent'
  }),
  EDIT_WIKI: defineAction<EditWikiAction>({
    worker: EditWikiWorker,
    inputSchema: editWikiInputSchema,
    outputSchema: editWikiOutputSchema,
    display: { label: 'Edit wiki page', description: 'Submit an edit through the MediaWiki API.', category: 'wiki' },
    timeoutMs: 60_000,
    retry: noRetry,
    sideEffect: 'write',
    idempotency: 'conditional'
  }),
  REGEXP_MATCH: defineAction<RegExpAction>({
    worker: RegexWorker,
    inputSchema: regexpInputSchema,
    outputSchema: regexpOutputSchema,
    display: { label: 'Match regular expression', description: 'Match text with a safe regular expression.', category: 'transformation' },
    timeoutMs: 10_000,
    retry: localRetry,
    sideEffect: 'none',
    idempotency: 'idempotent'
  }),
  SCSS_COMPILE: defineAction<SCSSAction>({
    worker: SCSSWorker,
    inputSchema: scssInputSchema,
    outputSchema: scssOutputSchema,
    display: { label: 'Compile SCSS', description: 'Compile SCSS source into CSS.', category: 'transformation' },
    timeoutMs: 30_000,
    retry: localRetry,
    sideEffect: 'none',
    idempotency: 'idempotent'
  }),
  DISCORD_MESSAGE: defineAction<DiscordMessageAction>({
    worker: DiscordMessageWorker,
    inputSchema: discordMessageInputSchema,
    outputSchema: discordMessageOutputSchema,
    display: { label: 'Send Discord message', description: 'Post a message to a Discord channel.', category: 'notification' },
    timeoutMs: 30_000,
    retry: noRetry,
    sideEffect: 'write',
    idempotency: 'non-idempotent'
  }),
  REQUEST: defineAction<RequestAction>({
    worker: RequestWorker,
    inputSchema: requestInputSchema,
    outputSchema: requestOutputSchema,
    display: { label: 'HTTP request', description: 'Send an HTTP request to an external service.', category: 'network' },
    timeoutMs: 30_000,
    retry: noRetry,
    sideEffect: 'write',
    idempotency: 'conditional'
  }),
  FEDI_POST: defineAction<FediPostAction>({
    worker: FediPostWorker,
    inputSchema: fediPostInputSchema,
    outputSchema: fediPostOutputSchema,
    display: { label: 'Publish Fediverse post', description: 'Publish a status to a Fediverse account.', category: 'notification' },
    timeoutMs: 30_000,
    retry: noRetry,
    sideEffect: 'write',
    idempotency: 'non-idempotent'
  })
} as const

export type ActionType = keyof typeof actionRegistry

// Object.keys cannot preserve literal keys; the registry remains the runtime source.
export const SUPPORTED_ACTION_TYPES = Object.freeze(Object.keys(actionRegistry) as ActionType[])

export function getActionCatalog (): ActionCatalogEntry[] {
  return Object.entries(actionRegistry).map(([type, registration]) => ({
    type,
    display: registration.display,
    inputSchema: actionJsonSchema.parse(z.toJSONSchema(registration.inputSchema, { io: 'input' })),
    outputSchema: actionJsonSchema.parse(z.toJSONSchema(registration.outputSchema)),
    timeoutMs: registration.timeoutMs,
    retry: registration.retry,
    sideEffect: registration.sideEffect,
    idempotency: registration.idempotency
  }))
}

export function isActionType (value: string): value is ActionType {
  return Object.hasOwn(actionRegistry, value)
}

function getActionRegistration<T extends ActionContract> (actionType: string): ActionRegistration<T> | undefined {
  if (!isActionType(actionType)) return undefined
  // The key check above is the runtime boundary between queue data and typed registrations.
  return actionRegistry[actionType] as unknown as ActionRegistration<T>
}

async function runWithTimeout<T> (operation: Promise<T>, timeoutMs: number): Promise<T> {
  const abortController = new AbortController()
  const timeout = delay(timeoutMs, undefined, {
    signal: abortController.signal,
    ref: false
  }).then(() => {
    throw new Error(`ACTION_TIMEOUT: ${timeoutMs}ms`)
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    abortController.abort()
  }
}

export async function processAction<T extends ActionContract> (
  job: Job<ActionJobData<T>, ActionJobResult<T>>
): Promise<ActionJobResult<T>> {
  const registration = getActionRegistration<T>(job.data.actionType)
  if (registration === undefined) throw new Error('UNKNOWN_ACTION_TYPE')
  registration.inputSchema.parse(job.data.input)
  const Worker = registration.worker
  const processor = new Worker(job)
  return await runWithTimeout(processor.handleJob(registration.outputSchema), registration.timeoutMs)
}

export function validateActionInput (actionType: string, input: unknown): string[] {
  const registration = getActionRegistration(actionType)
  if (registration === undefined) return ['unknown action type']
  const parsed = registration.inputSchema.safeParse(input)
  if (parsed.success) return []
  return parsed.error.issues.map(issue => {
    const path = issue.path.length === 0 ? 'input' : issue.path.join('.')
    return `${path}: ${issue.message}`
  })
}

export function getActionJobOptions (actionType: string, jobId: string): JobsOptions {
  const registration = getActionRegistration(actionType)
  if (registration === undefined) throw new Error('UNKNOWN_ACTION_TYPE')
  return {
    jobId,
    attempts: registration.retry.attempts,
    backoff: registration.retry.backoff
  }
}
