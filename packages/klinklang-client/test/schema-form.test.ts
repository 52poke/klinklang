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

  void test('accepts template URLs and nested templates without validating unresolved strings as literals', () => {
    deepEqual(validateParameterTemplate({
      method: 'PURGE',
      url: { Template: 'http://inazuma/wiki/{{encodeURI payload.page_title}}' }
    }, requestSchema), [])
    deepEqual(validateParameterTemplate({
      messages: [{ text: { Template: '{{payload.message}}' } }]
    }, {
      type: 'object',
      properties: {
        messages: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } } } }
      }
    }), [])
  })

  void test('does not treat malformed template wrappers as dynamic strings', () => {
    for (const url of [{ Template: 42 }, { Template: '{{url}}', extra: true }]) {
      equal(validateParameterTemplate({ method: 'GET', url }, requestSchema)
        .some(issue => issue.includes('expected a string')), true)
    }
  })

  void test('reports invalid literals and malformed JSONPath bindings', () => {
    const invalidUrl = validateParameterTemplate({ method: 'GET', url: 'relative' }, requestSchema)
    equal(invalidUrl.some(issue => issue.includes('absolute URL')), true)

    const invalidPath = validateParameterTemplate({ method: 'GET', 'url.$': 'endpoint' }, requestSchema)
    equal(invalidPath.some(issue => issue.includes('JSONPath')), true)
  })
})
