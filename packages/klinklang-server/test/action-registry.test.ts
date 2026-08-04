import { deepEqual, equal, ok } from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  SUPPORTED_ACTION_TYPES,
  actionRegistry,
  getActionJobOptions,
  isActionType,
  validateActionInput
} from '../src/actions/register.ts'

void describe('action registry', () => {
  void test('is the source of supported names and complete execution metadata', () => {
    deepEqual(SUPPORTED_ACTION_TYPES, Object.keys(actionRegistry))
    for (const registration of Object.values(actionRegistry)) {
      ok(registration.display.label.length > 0)
      ok(registration.display.description.length > 0)
      ok(registration.timeoutMs > 0)
      ok(registration.retry.attempts > 0)
      ok(registration.retry.backoff.delay >= 0)
      ok(['none', 'read', 'write'].includes(registration.sideEffect))
      ok(['idempotent', 'conditional', 'non-idempotent'].includes(registration.idempotency))
    }
  })

  void test('derives validation and queue retry options from an entry', () => {
    equal(isActionType('GET_HTML'), true)
    equal(isActionType('NOT_REGISTERED'), false)
    deepEqual(validateActionInput('REGEXP_MATCH', { text: 'abc', pattern: '^a' }), [])
    ok(validateActionInput('REGEXP_MATCH', { text: 'abc' }).length > 0)
    deepEqual(getActionJobOptions('GET_HTML', 'job-id'), {
      jobId: 'job-id',
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    })
    equal(getActionJobOptions('DISCORD_MESSAGE', 'job-id').attempts, 1)
  })
})
