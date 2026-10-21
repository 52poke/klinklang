export function isParameterTemplate (value: unknown): value is { Template: string } {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 1
    && 'Template' in value
    && typeof value.Template === 'string'
}
