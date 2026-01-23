import type { Logger } from 'pino'
import type { Config } from '../lib/config.ts'
import type { TerminologyService } from './terminology.ts'

export interface TranslateInput {
  sourceLng: 'en' | 'ja' | 'zh-hans' | 'zh-hant'
  targetLng: 'en' | 'ja' | 'zh-hans' | 'zh-hant'
  text: string
}

const languageNames: Record<TranslateInput['targetLng'], string> = {
  en: 'English',
  ja: 'Japanese',
  'zh-hans': 'Simplified Chinese',
  'zh-hant': 'Traditional Chinese'
}

export class TranslationService {
  readonly #config: Config
  readonly #terminology: TerminologyService
  readonly #logger: Logger

  constructor ({ config, terminologyService, logger }: {
    config: Config
    terminologyService: TerminologyService
    logger: Logger
  }) {
    this.#config = config
    this.#terminology = terminologyService
    this.#logger = logger
  }

  async *streamTranslation (input: TranslateInput): AsyncGenerator<string> {
    const glossary = await this.#terminology.getTerminologyPairsForText(
      input.sourceLng,
      input.targetLng,
      input.text
    )
    const glossaryLines = glossary.map(item => `${item.source}: ${item.result}`)
    const glossaryBlock = glossaryLines.length > 0
      ? `\n\n---\nPlease use the following terminology:\n${glossaryLines.join('\n')}\n`
      : '\n\n---\nPlease keep terminology consistent.\n'

    const prompt = [
      `Translate the following text into ${languageNames[input.targetLng]}:`,
      '',
      input.text,
      glossaryBlock,
      'Return only the translated text with no additional commentary.'
    ].join('\n')

    this.#logger.info({ prompt }, 'Sending translation request to LLM')

    const response = await fetch(`${this.#config.get('llm').baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#config.get('llm').apiKey}`
      },
      body: JSON.stringify({
        model: this.#config.get('llm').model,
        temperature: 0.2,
        stream: true,
        reasoning: {
          effort: 'none',
          enabled: false
        },
        messages: [
          {
            role: 'system',
            content: 'You are a translation engine. Output only the translation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    })

    if (!response.ok || response.body === null) {
      const errorText = await response.text().catch(() => '')
      this.#logger.error({ status: response.status, body: errorText }, 'LLM translation failed')
      throw new Error('TRANSLATION_FAILED')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) {
          continue
        }
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          return
        }
        try {
          const data = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
          }
          const chunk = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content
          if (chunk !== undefined && chunk !== '') {
            yield chunk
          }
        } catch (error) {
          this.#logger.error({ err: error }, 'Failed to parse LLM stream chunk')
        }
      }
    }
  }
}
