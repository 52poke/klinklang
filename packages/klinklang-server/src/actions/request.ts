import { ActionWorker } from './base.ts'

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
