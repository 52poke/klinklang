import { deepEqual, equal, throws } from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  applyPassState,
  applyStateOutput,
  buildStateInput,
  resolveChoiceNext,
  resolveNextTaskState,
  type ChoiceState,
  type StateMachineDefinition,
  type TaskState
} from '../src/models/asl.ts'

void describe('workflow engine transitions', () => {
  void test('resolves nested choice rules in declaration order', () => {
    const state: ChoiceState = {
      Type: 'Choice',
      Choices: [
        {
          And: [
            { Variable: '$.payload.kind', StringEquals: 'revision' },
            { Variable: '$.payload.score', NumericGreaterThanEqualsPath: '$.limits.minimum' }
          ],
          Next: 'Accepted'
        },
        {
          Variable: '$.payload.title',
          StringMatches: '^Draft:',
          Next: 'Draft'
        }
      ],
      Default: 'Rejected'
    }

    equal(resolveChoiceNext(state, {
      payload: { kind: 'revision', score: 10, title: 'Draft:Example' },
      limits: { minimum: 10 }
    }), 'Accepted')
    equal(resolveChoiceNext(state, {
      payload: { kind: 'revision', score: 9, title: 'Draft:Example' },
      limits: { minimum: 10 }
    }), 'Draft')
    equal(resolveChoiceNext(state, {
      payload: { kind: 'revision', score: 9, title: 'Example' },
      limits: { minimum: 10 }
    }), 'Rejected')
  })

  void test('skips pass and choice states to find the next task or terminal state', () => {
    const definition: StateMachineDefinition = {
      StartAt: 'First',
      States: {
        First: { Type: 'Task', Resource: 'REQUEST', Next: 'Prepare' },
        Prepare: { Type: 'Pass', Next: 'Route' },
        Route: {
          Type: 'Choice',
          Choices: [{ Variable: '$.approved', BooleanEquals: true, Next: 'Second' }],
          Default: 'Rejected'
        },
        Second: { Type: 'Task', Resource: 'REQUEST', End: true },
        Rejected: { Type: 'Fail', Error: 'REJECTED' }
      }
    }

    equal(resolveNextTaskState(definition, 'First', { approved: true })?.name, 'Second')
    equal(resolveNextTaskState(definition, 'First', { approved: false }), null)
    equal(resolveNextTaskState(definition, 'Second', { approved: true }), null)
  })

  void test('applies input, parameters, result, and output paths without losing context', () => {
    const state: TaskState = {
      Type: 'Task',
      Resource: 'REQUEST',
      InputPath: '$.payload',
      Parameters: {
        'url.$': '$.url',
        headers: {
          authorization: { Template: 'Bearer {{token}}' }
        }
      },
      ResultPath: '$.result.request',
      OutputPath: '$.result'
    }
    const context = {
      payload: { url: 'https://example.test', token: 'secret' },
      untouched: true
    }

    deepEqual(buildStateInput(state, context), {
      url: 'https://example.test',
      headers: { authorization: 'Bearer secret' }
    })
    deepEqual(applyStateOutput(state, context, { statusCode: 200 }), {
      request: { statusCode: 200 }
    })
    equal(context.untouched, true)
  })

  void test('pass states can replace their selected context and unsafe regexes are rejected', () => {
    deepEqual(applyPassState({
      Type: 'Pass',
      InputPath: '$.payload',
      Parameters: { 'name.$': '$.name' },
      ResultPath: '$'
    }, { payload: { name: 'Klinklang' } }), { name: 'Klinklang' })

    throws(() => resolveChoiceNext({
      Type: 'Choice',
      Choices: [{ Variable: '$.value', StringMatches: '(a+)+$', Next: 'Matched' }]
    }, { value: 'aaaa' }), /UNSAFE_STRING_MATCHES_REGEX/v)
  })
})
