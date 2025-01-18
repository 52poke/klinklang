import { diContainer } from '@fastify/awilix'
import type { PrismaPromise } from '@mudkipme/klinklang-prisma'
import { load } from 'cheerio'
import { ActionWorker } from './base.ts'
import type { GetHTMLActionOutput } from './wiki.ts'

export type ParseTerminologyListActionInput = GetHTMLActionOutput & {
  entrySelector: string
  idSelector?: string
  langSelectorMap: { zh: string; [lang: string]: string }
}

export type ParseTerminologyListOutput = Array<{ id: number; texts: Record<string, string> }>

export interface ParseTerminologyListAction {
  actionType: 'PARSE_TERMINOLOGY_LIST'
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
      const textId = this.input.idSelector !== undefined
        ? parseInt($(line).find(this.input.idSelector).text().trim(), 10)
        : index + 1
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
          const textId = this.input.idSelector !== undefined
            ? parseInt($(line).find(this.input.idSelector).text().trim(), 10)
            : index + 1
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
  actionType: 'UPDATE_TERMINOLOGY'
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
