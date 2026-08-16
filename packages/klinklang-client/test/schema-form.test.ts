import { deepEqual, equal } from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ActionJsonSchema } from '@mudkipme/klinklang-domain'
import {
  createDefaultParameters,
  validateParameterTemplate
} from '../src/pages/Workflows/editor/schema-form.ts'

const requestSchema: ActionJsonSchema = {
  type: 'object',
  properties: {
    method: { type: 'string', 'x-ui-options': ['GET', 'POST'] },
    url: { type: 'string', format: 'uri' },
    headers: { type: 'object', additionalProperties: { type: 'string' } }
  },
  required: ['method', 'url'],
  additionalProperties: false
}

void describe('schema-driven action forms', () => {
  void test('creates required defaults without inventing optional values', () => {
    deepEqual(createDefaultParameters(requestSchema), { method: 'GET', url: '' })
  })

  void test('treats JSONPath bindings as values for required action fields', () => {
    deepEqual(validateParameterTemplate({ method: 'POST', 'url.$': '$.endpoint' }, requestSchema), [])
  })

  void test('reports invalid literals and malformed JSONPath bindings', () => {
    const invalidUrl = validateParameterTemplate({ method: 'GET', url: 'relative' }, requestSchema)
    equal(invalidUrl.some(issue => issue.includes('absolute URL')), true)

    const invalidPath = validateParameterTemplate({ method: 'GET', 'url.$': 'endpoint' }, requestSchema)
    equal(invalidPath.some(issue => issue.includes('JSONPath')), true)
  })
})
