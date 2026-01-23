import type { PrismaClient, Terminology } from '@mudkipme/klinklang-prisma'
import type { Logger } from 'pino'
import type { MessageType, Notification } from '../lib/notification.ts'

export interface TerminologyReplaceInput {
  sourceLng: string
  resultLng: string
  categories: string[]
  text: string
}

export interface TerminologyPair {
  source: string
  result: string
}

export class TerminologyService {
  #terminologyDataCache: Terminology[] | undefined
  readonly #prisma: PrismaClient
  readonly #notification: Notification
  readonly #logger: Logger

  constructor ({ prisma, notification, logger }: { prisma: PrismaClient; notification: Notification; logger: Logger }) {
    this.#prisma = prisma
    this.#notification = notification
    this.#logger = logger
    notification.addEventListener('notification', this.#handleMessage)
  }

  readonly #handleMessage = (e: Event): void => {
    const evt = e as CustomEvent<MessageType>
    if (evt.detail.type === 'TERMINOLOGY_UPDATE' && this.#terminologyDataCache !== undefined) {
      this.updateTerminologyCache().catch((err: unknown) => {
        this.#logger.error(err)
      })
    }
  }

  dispose (): void {
    this.#notification.removeEventListener('notification', this.#handleMessage)
  }

  async updateTerminologyCache (): Promise<void> {
    this.#terminologyDataCache = await this.#prisma.terminology.findMany()
  }

  async replace (input: TerminologyReplaceInput): Promise<string> {
    const sorted = await this.getTerminologyPairs(input.sourceLng, input.resultLng, input.categories)
    let result = input.text
    for (const item of sorted) {
      if (item.source === '' || item.result === '') {
        continue
      }
      result = result.split(item.source).join(item.result)
    }
    return result
  }

  async getTerminologyPairs (
    sourceLng: string,
    resultLng: string,
    categories?: string[]
  ): Promise<TerminologyPair[]> {
    if (this.#terminologyDataCache === undefined) {
      await this.updateTerminologyCache()
    }
    const terms = (this.#terminologyDataCache ?? []).filter(term =>
      (categories === undefined || categories.includes(term.category))
      && (term.lang === sourceLng || term.lang === resultLng)
    )

    const texts = new Map<string, { source: string; result: string }>()
    for (const term of terms) {
      const key = `${term.category}:${term.textId}`
      const item = texts.get(key) ?? { source: '', result: '' }
      if (term.lang === sourceLng) {
        item.source = term.text
      } else {
        item.result = term.text
      }
      texts.set(key, item)
    }

    return Array.from(texts.values()).sort((lhs, rhs) => rhs.source.length - lhs.source.length)
  }

  async getTerminologyPairsForText (
    sourceLng: string,
    resultLng: string,
    text: string,
    categories?: string[]
  ): Promise<TerminologyPair[]> {
    const all = await this.getTerminologyPairs(sourceLng, resultLng, categories)
    const matched = all.filter(item => item.source !== '' && text.includes(item.source))
    return matched.sort((lhs, rhs) => rhs.source.length - lhs.source.length)
  }
}
