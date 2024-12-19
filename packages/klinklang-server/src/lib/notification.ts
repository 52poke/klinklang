import type { Redis } from 'ioredis'

export type MessageType =
  | {
    type: 'TERMINOLOGY_UPDATE'
  }
  | {
    type: 'WORKFLOW_EVENTBUS_UPDATE'
  }

export class Notification extends EventTarget {
  readonly #subscriber: Redis
  readonly #publisher: Redis
  public constructor (subscriber: Redis, publisher: Redis) {
    super()
    this.#subscriber = subscriber
    this.#publisher = publisher
    this.#subscriber.on('message', this.#handleMessage)
    this.#subscriber.subscribe('notification').catch((error: unknown) => {
      this.dispatchEvent(new CustomEvent('error', { detail: { error } }))
    })
  }

  readonly #handleMessage = (channel: string, message: string): void => {
    if (channel === 'notification') {
      this.dispatchEvent(new CustomEvent('notification', { detail: JSON.parse(message) as MessageType }))
    }
  }

  public async sendMessage (message: MessageType): Promise<number> {
    return await this.#publisher.publish('notification', JSON.stringify(message))
  }
}

export const getNotification = ({ redis, subscriberRedis }: { redis: Redis; subscriberRedis: Redis }): Notification =>
  new Notification(subscriberRedis, redis)
