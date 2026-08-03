import safe from 'safe-regex'
import { z } from 'zod'
import { ActionWorker } from './base.ts'

export const regexpInputSchema = z.object({
  text: z.string(),
  pattern: z.string(),
  flags: z.string().optional()
}).strict().superRefine((input, context) => {
  try {
    const regex = new RegExp(input.pattern, input.flags)
    if (!safe(regex)) {
      context.addIssue({ code: 'custom', message: 'unsafe regular expression', path: ['pattern'] })
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'invalid regular expression', path: ['pattern'] })
  }
})

export const regexpOutputSchema = z.object({
  matches: z.union([
    z.array(z.string()),
    z.array(z.array(z.string()))
  ])
}).strict()

export interface RegExpActionInput {
  text: string
  pattern: string
  flags?: string
}

export interface RegExpActionOutput {
  matches: string[] | string[][]
}

export interface RegExpAction {
  actionType: 'REGEXP_MATCH'
  input: RegExpActionInput
  output: RegExpActionOutput
}

export class RegexWorker extends ActionWorker<RegExpAction> {
  public process (): RegExpActionOutput {
    const regex = new RegExp(this.input.pattern, this.input.flags)
    if (!safe(regex)) {
      throw new Error('UNSAFE_REGEX')
    }
    if (regex.global) {
      const allMatch = Array.from(this.input.text.matchAll(regex))
      return {
        matches: allMatch.map(result => Array.from(result))
      }
    }
    return {
      matches: Array.from(this.input.text.match(regex) ?? [])
    }
  }
}
