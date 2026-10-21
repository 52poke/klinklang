import { deepEqual, ok } from 'node:assert/strict'
import { test } from 'node:test'
import type { WorkflowCreateRequest } from '@mudkipme/klinklang-domain'
import { validateActionInput } from '../src/actions/register.ts'
import { validateWorkflowCreatePayload, validateWorkflowUpdatePayload } from '../src/lib/workflow-validation.ts'
import { buildStateInput } from '../src/models/asl.ts'

const request = {
  Type: 'Task' as const,
  Resource: 'REQUEST',
  Parameters: {
    url: { Template: 'http://inazuma/wiki/{{encodeURI payload.page_title}}' },
    method: 'PURGE'
  },
  ResultPath: '$.response',
  End: true as const
}

const workflow: WorkflowCreateRequest = {
  name: 'Purge wiki page',
  isPrivate: false,
  enabled: true,
  triggers: [],
  definition: { StartAt: 'REQUEST_1', States: { REQUEST_1: request } }
}

void test('template URL workflows can be created and edited, then resolve to valid action inputs', () => {
  const created = validateWorkflowCreatePayload(workflow)
  deepEqual(created.issues, [])
  ok(created.data !== null)
  const updated = validateWorkflowUpdatePayload({ definition: workflow.definition, expectedRevision: 1 }, workflow)
  deepEqual(updated.issues, [])
  ok(updated.data !== null)

  const input = buildStateInput(request, { payload: { page_title: '皮卡丘 测试' } })
  deepEqual(input, {
    url: `http://inazuma/wiki/${encodeURI('皮卡丘 测试')}`,
    method: 'PURGE'
  })
  deepEqual(validateActionInput('REQUEST', input), [])
})

void test('nested templates are recognized without a JSONPath binding', () => {
  const definition = {
    StartAt: 'Request',
    States: {
      Request: {
        ...request,
        Parameters: {
          method: 'GET',
          url: 'http://inazuma/wiki/Test',
          headers: { authorization: { Template: 'Bearer {{token}}' } }
        }
      }
    }
  }
  deepEqual(validateWorkflowCreatePayload({ ...workflow, definition }).issues, [])
})

void test('invalid template wrappers and literal URLs still fail validation', () => {
  for (const url of [{ Template: 42 }, { Template: '{{url}}', extra: true }, 'not-a-url']) {
    const definition = {
      StartAt: 'Request',
      States: { Request: { ...request, Parameters: { method: 'GET', url } } }
    }
    const result = validateWorkflowCreatePayload({ ...workflow, definition })
    ok(result.data === null)
    ok(result.issues.some(issue => issue.includes('States.Request.Parameters.url')))
  }
})
