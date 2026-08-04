import * as sass from 'sass-embedded'
import { z } from 'zod'
import { ActionWorker } from './base.ts'

export const scssInputSchema = z.object({
  scss: z.string(),
  variables: z.record(z.string(), z.union([z.string(), z.number()]))
}).strict()

export const scssOutputSchema = z.object({
  css: z.string()
}).strict()

export interface SCSSActionInput {
  scss: string
  variables: Record<string, string | number>
}

export interface SCSSActionOutput {
  css: string
}

export interface SCSSAction {
  input: SCSSActionInput
  output: SCSSActionOutput
}

export class SCSSWorker extends ActionWorker<SCSSAction> {
  public async process(): Promise<SCSSActionOutput> {
    const variableText = Object.keys(this.input.variables).map(key => `$${key}: "${this.input.variables[key]}";\n`)
      .join('')
    const result = await sass.compileStringAsync(variableText + this.input.scss)
    return {
      css: result.css
    }
  }
}
