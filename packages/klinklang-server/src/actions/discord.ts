import { diContainer } from '@fastify/awilix'
import { TextChannel } from 'discord.js'
import type { APIEmbed, MessageCreateOptions, MessagePayload } from 'discord.js'
import { WikiWorker } from './wiki.ts'

export interface DiscordMessageActionInput {
  channel: string
  message: string | MessagePayload | MessageCreateOptions | { embed: APIEmbed }
}

export interface DiscordMessageActionOutput {
  id: string
}

export interface DiscordMessageAction {
  actionType: 'DISCORD_MESSAGE'
  input: DiscordMessageActionInput
  output: DiscordMessageActionOutput
}

export class DiscordMessageWorker extends WikiWorker<DiscordMessageAction> {
  public async process (): Promise<DiscordMessageActionOutput> {
    const channel = await diContainer.cradle.discordClient.channels.fetch(this.input.channel)
    if (channel instanceof TextChannel) {
      if (typeof this.input.message === 'object' && 'embed' in this.input.message) {
        const message = await channel.send({ embeds: [this.input.message.embed] })
        return { id: message.id }
      }
      const message = await channel.send(this.input.message)
      return {
        id: message.id
      }
    }
    throw new Error('NOT_A_TEXT_CHANNEL')
  }
}
