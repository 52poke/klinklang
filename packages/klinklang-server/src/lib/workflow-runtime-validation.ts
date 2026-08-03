import { JSONPath } from 'jsonpath-plus'
import safeRegex from 'safe-regex'
import { z } from 'zod'

const predicateOps = [
  'contains',
  'defined',
  'undefined',
  'ends',
  'starts',
  'less',
  'more',
  'in',
  'matches',
  'test',
  'type',
  'contained',
  'intersects',
  'and',
  'or',
  'not'
] as const

export const eventPredicateSchema: z.ZodType = z.lazy(() => z.looseObject({
  op: z.enum(predicateOps),
  path: z.string().startsWith('/').optional(),
  value: z.unknown().optional(),
  apply: z.array(eventPredicateSchema).min(1).optional(),
  ignore_case: z.boolean().optional()
}).superRefine((predicate, context) => {
  const secondOrder = ['and', 'or', 'not'].includes(predicate.op)
  if (secondOrder) {
    if (predicate.apply === undefined) {
      context.addIssue({ code: 'custom', message: 'apply is required', path: ['apply'] })
    }
  } else if (predicate.path === undefined) {
    context.addIssue({ code: 'custom', message: 'path is required', path: ['path'] })
  }
  const valueRequired = !['defined', 'undefined', 'and', 'or', 'not'].includes(predicate.op)
  if (valueRequired && !('value' in predicate)) {
    context.addIssue({ code: 'custom', message: 'value is required', path: ['value'] })
  }
  if (['less', 'more'].includes(predicate.op) && typeof predicate.value !== 'number') {
    context.addIssue({ code: 'custom', message: 'value must be numeric', path: ['value'] })
  }
  if (['in', 'intersects'].includes(predicate.op) && !Array.isArray(predicate.value)) {
    context.addIssue({ code: 'custom', message: 'value must be an array', path: ['value'] })
  }
  if (predicate.op === 'matches') {
    if (typeof predicate.value !== 'string') {
      context.addIssue({ code: 'custom', message: 'value must be a string', path: ['value'] })
      return
    }
    try {
      const regex = new RegExp(predicate.value, predicate.ignore_case === true ? 'i' : '')
      if (!safeRegex(regex)) {
        context.addIssue({ code: 'custom', message: 'unsafe regular expression', path: ['value'] })
      }
    } catch {
      context.addIssue({ code: 'custom', message: 'invalid regular expression', path: ['value'] })
    }
  }
}))

const hasBalancedPathDelimiters = (path: string): boolean => {
  const stack: string[] = []
  let quote: "'" | '"' | null = null
  let escaped = false
  for (const character of path) {
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (quote !== null) {
      if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
    } else if (character === '[' || character === '(') {
      stack.push(character)
    } else if (character === ']' || character === ')') {
      const expected = character === ']' ? '[' : '('
      if (stack.pop() !== expected) {
        return false
      }
    }
  }
  return quote === null && stack.length === 0 && !escaped
}

export function isValidJSONPath (path: string): boolean {
  if (!path.startsWith('$') || path.includes('?(') || !hasBalancedPathDelimiters(path)) {
    return false
  }
  try {
    JSONPath({ json: {}, path, eval: false })
    return true
  } catch {
    return false
  }
}

export function validateJSONPath (value: string | null | undefined, path: string, issues: string[]): void {
  if (value !== undefined && value !== null && !isValidJSONPath(value)) {
    issues.push(`${path}: invalid JSONPath expression`)
  }
}

export function validateParameterPaths (value: unknown, path: string, issues: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      validateParameterPaths(entry, `${path}.${index}`, issues)
    })
    return
  }
  if (value === null || typeof value !== 'object') {
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = `${path}.${key}`
    if (key.endsWith('.$')) {
      if (typeof entry === 'string') {
        validateJSONPath(entry, entryPath, issues)
      } else {
        issues.push(`${entryPath}: JSONPath parameter value must be a string`)
      }
    } else {
      validateParameterPaths(entry, entryPath, issues)
    }
  }
}

export function validateChoiceConditionPaths (
  condition: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  for (const key of ['And', 'Or']) {
    const nested = condition[key]
    if (Array.isArray(nested)) {
      nested.forEach((entry, index) => {
        validateChoiceConditionPaths(entry as Record<string, unknown>, `${path}.${key}.${index}`, issues)
      })
      return
    }
  }
  if (condition.Not !== undefined) {
    validateChoiceConditionPaths(condition.Not as Record<string, unknown>, `${path}.Not`, issues)
    return
  }
  if (typeof condition.Variable === 'string') {
    validateJSONPath(condition.Variable, `${path}.Variable`, issues)
  }
  for (const [key, value] of Object.entries(condition)) {
    if (key.endsWith('Path') && typeof value === 'string') {
      validateJSONPath(value, `${path}.${key}`, issues)
    }
  }
  if (typeof condition.StringMatches === 'string') {
    try {
      const regex = new RegExp(condition.StringMatches, 'v')
      if (!safeRegex(regex)) {
        issues.push(`${path}.StringMatches: unsafe regular expression`)
      }
    } catch {
      issues.push(`${path}.StringMatches: invalid regular expression`)
    }
  }
}
