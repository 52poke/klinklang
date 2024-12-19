import { diContainer } from '@fastify/awilix'
import { omit } from 'lodash-es'
import type { mastodon } from 'masto'
import { ActionWorker } from './base.js'

export type FediPostActionInput = mastodon.rest.v1.CreateStatusParams & { subject: string }
export type FediPostActionOutput = mastodon.v1.Status

export interface FediPostAction {
  actionType: 'FEDI_POST'
  input: FediPostActionInput
  output: FediPostActionOutput
}

export class FediPostWorker extends ActionWorker<FediPostAction> {
  public async process (): Promise<FediPostActionOutput> {
    const { fediverseService } = diContainer.cradle

    const workflow = await this.getWorkflow()
    if (workflow?.user === null || workflow?.user === undefined) {
      throw new Error('user not found')
    }
    const client = await fediverseService.getClient(workflow.user.id, this.input.subject)
    return await client.v1.statuses.create(omit(this.input, 'subject') as mastodon.rest.v1.CreateStatusParams)
  }
}
