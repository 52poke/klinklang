import type { ActionJsonSchema } from '@mudkipme/klinklang-domain'

export interface FormJsonSchema extends ActionJsonSchema {
  type?: string | string[]
  title?: string
  description?: string
  format?: string
  enum?: unknown[]
  properties?: Record<string, FormJsonSchema>
  required?: string[]
  items?: FormJsonSchema
  oneOf?: FormJsonSchema[]
  anyOf?: FormJsonSchema[]
  additionalProperties?: boolean | FormJsonSchema
  default?: unknown
  minLength?: number
  minimum?: number
  'x-ui-widget'?: string
  'x-ui-options'?: string[]
}

export const asFormJsonSchema = (schema: ActionJsonSchema): FormJsonSchema => schema

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
)

export function humanizeFieldName (name: string): string {
  return name
    .replaceAll(/[A-Z]/gv, letter => ` ${letter}`)
    .replaceAll(/[_\-]+/gv, ' ')
    .replace(/^./v, first => first.toUpperCase())
}

export function createDefaultValue (schema: FormJsonSchema): unknown {
  if (schema.default !== undefined) return structuredClone(schema.default)
  const options = schema['x-ui-options']
  if (options !== undefined && options.length > 0) return options[0]
  if (schema.enum !== undefined && schema.enum.length > 0) return schema.enum[0]
  if (schema.type === 'object' || schema.properties !== undefined) {
    const value: Record<string, unknown> = {}
    for (const name of schema.required ?? []) {
      const propertySchema = schema.properties?.[name]
      if (propertySchema !== undefined) value[name] = createDefaultValue(propertySchema)
    }
    return value
  }
  if (schema.type === 'array') return []
  if (schema.type === 'boolean') return false
  if (schema.type === 'number' || schema.type === 'integer') return 0
  if (schema.type === 'string') return ''
  return null
}

export function createDefaultParameters (schema: ActionJsonSchema): Record<string, unknown> {
  const value = createDefaultValue(asFormJsonSchema(schema))
  return isRecord(value) ? value : {}
}

export function validateParameterTemplate (
  parameters: unknown,
  inputSchema: ActionJsonSchema,
  rootPath = 'Parameters'
): string[] {
  const issues: string[] = []
  validateSchemaValue(parameters, asFormJsonSchema(inputSchema), { path: rootPath, issues, allowBindings: true })
  return issues
}

interface ValidationContext {
  path: string
  issues: string[]
  allowBindings?: boolean
}

function validateSchemaValue (
  value: unknown,
  schema: FormJsonSchema,
  context: ValidationContext
): void {
  const { path, issues, allowBindings = false } = context
  if (schema.oneOf !== undefined || schema.anyOf !== undefined) return
  if (schema.enum !== undefined && !schema.enum.some(candidate => Object.is(candidate, value))) {
    issues.push(`${path}: select one of the allowed values`)
    return
  }
  const type = Array.isArray(schema.type) ? schema.type.find(candidate => candidate !== 'null') : schema.type
  if (type === 'object' || schema.properties !== undefined) {
    if (!isRecord(value)) {
      issues.push(`${path}: expected an object`)
      return
    }
    const properties = schema.properties ?? {}
    for (const required of schema.required ?? []) {
      if (!(required in value) && !(`${required}.$` in value)) {
        issues.push(`${path}.${required}: required`)
      }
    }
    for (const [name, entry] of Object.entries(value)) {
      if (name.endsWith('.$')) {
        if (!allowBindings || typeof entry !== 'string' || !entry.startsWith('$')) {
          issues.push(`${path}.${name}: expected a JSONPath beginning with $`)
        }
        continue
      }
      if (Object.hasOwn(properties, name)) {
        validateSchemaValue(entry, properties[name], { path: `${path}.${name}`, issues, allowBindings: true })
      }
    }
    return
  }
  if (type === 'array') {
    if (!Array.isArray(value)) {
      issues.push(`${path}: expected an array`)
      return
    }
    const itemSchema = schema.items
    if (itemSchema !== undefined) {
      value.forEach((entry, index) => {
        validateSchemaValue(entry, itemSchema, { path: `${path}.${index}`, issues })
      })
    }
    return
  }
  if (type === 'string') {
    if (typeof value !== 'string') issues.push(`${path}: expected a string`)
    else if ((schema.minLength ?? 0) > value.length) issues.push(`${path}: cannot be empty`)
    else if (schema.format === 'uri' && !URL.canParse(value)) issues.push(`${path}: expected an absolute URL`)
    return
  }
  if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) issues.push(`${path}: expected a number`)
    else if (type === 'integer' && !Number.isInteger(value)) issues.push(`${path}: expected an integer`)
    return
  }
  if (type === 'boolean' && typeof value !== 'boolean') issues.push(`${path}: expected a boolean`)
}
