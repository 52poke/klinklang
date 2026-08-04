import { diContainer } from '@fastify/awilix'
import type { PrismaPromise } from '@mudkipme/klinklang-prisma'
import { load } from 'cheerio'
import { z } from 'zod'
import { ActionWorker } from './base.ts'
import type { GetHTMLActionOutput } from './wiki.ts'

const terminologyTextsSchema = z.record(z.string(), z.string())

export const parseTerminologyInputSchema = z.object({
  text: z.string(),
  variants: z.object({
    'zh-hans': z.string().optional(),
    'zh-hant': z.string().optional()
  }).strict().optional(),
  entrySelector: z.string().min(1),
  idSelector: z.string().min(1).optional(),
  langSelectorMap: z.record(z.string(), z.string()).refine(map => typeof map.zh === 'string', {
    message: 'langSelectorMap.zh is required'
  })
}).strict()

export const parseTerminologyOutputSchema = z.array(z.object({
  id: z.number().int(),
  texts: terminologyTextsSchema
}).strict())

export const updateTerminologyInputSchema = z.object({
  category: z.string().min(1),
  list: parseTerminologyOutputSchema
}).strict()

export const updateTerminologyOutputSchema = z.null()

export type ParseTerminologyListActionInput = GetHTMLActionOutput & {
  entrySelector: string
  idSelector?: string
  langSelectorMap: { zh: string; [lang: string]: string }
}

export type ParseTerminologyListOutput = Array<{ id: number; texts: Record<string, string> }>

export interface ParseTerminologyListAction {
  input: ParseTerminologyListActionInput
  output: ParseTerminologyListOutput
}

export class ParseTerminologyWorker extends ActionWorker<ParseTerminologyListAction> {
  public process (): ParseTerminologyListOutput {
    const dict = new Map<number, Record<string, string>>()

    // load non-zh terminologies
    const $ = load(this.input.text)
    const { variants } = this.input
    const hasVariants = variants !== undefined && Object.keys(variants).length > 0

    $(this.input.entrySelector).each((index, line) => {
      const textId = this.input.idSelector === undefined
        ? index + 1
        : parseInt($(line).find(this.input.idSelector).text().trim(), 10)
      if (isNaN(textId)) {
        return
      }

      const texts: Record<string, string> = {}

      for (const lang of Object.keys(this.input.langSelectorMap)) {
        if (hasVariants && lang === 'zh') {
          continue
        }
        const text = $(line).find(this.input.langSelectorMap[lang]).text().trim()
        if (text !== '') {
          texts[lang] = text
        }
      }

      if (Object.keys(texts).length > 0) {
        dict.set(textId, texts)
      }
    })

    // load zh terminologies
    if (hasVariants) {
      for (const variant of ['zh-hant', 'zh-hans']) {
        const $ = load(variants[variant as 'zh-hant' | 'zh-hans'] ?? this.input.text)

        $(this.input.entrySelector).each((index, line) => {
          const textId = this.input.idSelector === undefined
            ? index + 1
            : parseInt($(line).find(this.input.idSelector).text().trim(), 10)
          if (isNaN(textId)) {
            return
          }

          const text = $(line).find(this.input.langSelectorMap.zh).text().trim()
          const texts = dict.get(textId)
          if (texts !== undefined && text !== '') {
            texts[variant] = text
          }
        })
      }
    }

    return Array.from(dict.entries()).map(pair => ({ id: pair[0], texts: pair[1] }))
  }
}

export interface UpdateTerminologyActionInput {
  category: string
  list: ParseTerminologyListOutput
}

export interface UpdateTerminologyAction {
  input: UpdateTerminologyActionInput
  output: null
}

export class UpdateTerminologyWorker extends ActionWorker<UpdateTerminologyAction> {
  public async process (): Promise<null> {
    const { prisma, notification } = diContainer.cradle
    const transactions: Array<PrismaPromise<unknown>> = []

    transactions.push(prisma.terminology.deleteMany({ where: { category: this.input.category } }))
    for (const { id, texts } of this.input.list) {
      for (const lang of Object.keys(texts)) {
        transactions.push(prisma.terminology.create({
          data: {
            textId: id,
            lang,
            category: this.input.category,
            text: texts[lang]
          }
        }))
      }
    }

    await prisma.$transaction(transactions)
    await notification.sendMessage({ type: 'TERMINOLOGY_UPDATE' })
    return null
  }
}
