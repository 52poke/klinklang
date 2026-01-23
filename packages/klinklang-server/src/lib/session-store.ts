import type { SessionStore } from '@fastify/session'
import type { Session } from 'fastify'
import type { Redis } from 'ioredis'

type Callback<T = void> = (err?: Error | null, result?: T) => void

const toSeconds = (cookie?: Session['cookie']): number | undefined => {
  if (cookie === undefined) {
    return undefined
  }
  if (typeof cookie.maxAge === 'number') {
    return Math.ceil(cookie.maxAge / 1000)
  }
  if (cookie.expires instanceof Date) {
    const diff = Math.ceil((cookie.expires.getTime() - Date.now()) / 1000)
    return diff > 0 ? diff : 0
  }
  if (typeof cookie.expires === 'string') {
    const parsed = Date.parse(cookie.expires)
    if (!Number.isNaN(parsed)) {
      const diff = Math.ceil((parsed - Date.now()) / 1000)
      return diff > 0 ? diff : 0
    }
  }
  return undefined
}

export class RedisSessionStore implements SessionStore {
  readonly #redis: Redis
  readonly #prefix: string

  constructor (redis: Redis, prefix = 'sess:') {
    this.#redis = redis
    this.#prefix = prefix
  }

  #key (sessionId: string): string {
    return `${this.#prefix}${sessionId}`
  }

  get (sessionId: string, callback: Callback<Session | null>): void {
    void this.#redis
      .get(this.#key(sessionId))
      .then((data) => {
        if (data === null) {
          callback(null, null)
          return
        }
        callback(null, JSON.parse(data) as Session)
      })
      .catch((error: unknown) => {
        callback(error as Error)
      })
  }

  set (sessionId: string, session: Session, callback: Callback): void {
    const ttl = toSeconds(session.cookie)
    const payload = JSON.stringify(session)
    const setPromise = ttl === undefined
      ? this.#redis.set(this.#key(sessionId), payload)
      : this.#redis.set(this.#key(sessionId), payload, 'EX', ttl)
    void setPromise
      .then(() => {
        callback(null)
      })
      .catch((error: unknown) => {
        callback(error as Error)
      })
  }

  destroy (sessionId: string, callback: Callback): void {
    void this.#redis
      .del(this.#key(sessionId))
      .then(() => {
        callback(null)
      })
      .catch((error: unknown) => {
        callback(error as Error)
      })
  }

  touch (sessionId: string, session: Session, callback: Callback): void {
    const ttl = toSeconds(session.cookie)
    if (ttl === undefined) {
      callback(null)
      return
    }
    void this.#redis
      .expire(this.#key(sessionId), ttl)
      .then(() => {
        callback(null)
      })
      .catch((error: unknown) => {
        callback(error as Error)
      })
  }
}
