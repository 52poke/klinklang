import { z } from 'zod'
import { ActionWorker } from './base.ts'

export const requestInputSchema = z.object({
  method: z.string().min(1),
  url: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional()
}).strict()

export const requestOutputSchema = z.object({
  statusCode: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.string()
}).strict()

export interface RequestActionInput {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

export interface RequestActionOutput {
  statusCode: number
  headers: Record<string, string>
  body: string
}

export interface RequestAction {
  actionType: 'REQUEST'
  input: RequestActionInput
  output: RequestActionOutput
}

export class RequestWorker extends ActionWorker<RequestAction> {
  public async process (): Promise<RequestActionOutput> {
    const response = await fetch(this.input.url, {
      method: this.input.method,
      headers: this.input.headers,
      body: this.input.body
    })
    const body = await response.text()
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body
    }
  }
}
