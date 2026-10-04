import { z } from 'zod'

const translationSchema = z.strictObject({ translation: z.string() })

export const translationResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'translation',
    strict: true,
    schema: {
      type: 'object',
      properties: { translation: { type: 'string', description: 'The complete translated text.' } },
      required: ['translation'],
      additionalProperties: false
    }
  }
} as const

// Decode only the translation string while the JSON object is still arriving.
// JSON.parse handles escapes; incomplete escape sequences wait for the next chunk.
export class TranslationOutput {
  #json = ''
  #position = 0
  #started = false
  #closed = false
  #pendingSurrogate = ''
  #translation = ''

  append (chunk: string): string {
    this.#json += chunk
    if (!this.#started) {
      const prefix = /^\s*\{\s*"translation"\s*:\s*"/v.exec(this.#json)
      if (prefix === null) {
        return ''
      }
      this.#position = prefix[0].length
      this.#started = true
    }

    const start = this.#position
    while (!this.#closed && this.#position < this.#json.length) {
      const character = this.#json[this.#position]
      if (character === '"') {
        this.#closed = true
        break
      }
      if (character === '\\') {
        const escapeLength = this.#json[this.#position + 1] === 'u' ? 6 : 2
        if (this.#position + escapeLength > this.#json.length) {
          break
        }
        this.#position += escapeLength
      } else {
        this.#position += 1
      }
    }

    const decoded = z.string().parse(JSON.parse(`"${this.#json.slice(start, this.#position)}"`))
    let text = this.#pendingSurrogate + decoded
    this.#pendingSurrogate = ''
    const lastCode = text.charCodeAt(text.length - 1)
    if (!this.#closed && lastCode >= 0xD800 && lastCode <= 0xDBFF) {
      this.#pendingSurrogate = text.slice(-1)
      text = text.slice(0, -1)
    }
    this.#translation += text
    return text
  }

  finish (): void {
    const result = translationSchema.parse(JSON.parse(this.#json))
    // Also reject duplicate fields or an unexpected shape that changed the emitted text.
    if (!this.#closed || result.translation !== this.#translation
      || !/^"\s*\}\s*$/v.test(this.#json.slice(this.#position))) {
      throw new Error('Invalid translation output')
    }
  }
}
