import { deepEqual, equal, throws } from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  applyPassState,
  applyStateOutput,
  buildStateInput,
  interpretStateTransition,
  resolveChoiceNext,
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

  void test('uses one interpreter for start, next-task, and terminal traversal', () => {
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

    const started = interpretStateTransition(definition, {
      context: { approved: true },
      applyPassState
    })
    equal(started.status, 'task')
    equal(started.name, 'First')

    const accepted = interpretStateTransition(definition, {
      afterStateName: 'First',
      context: { approved: true },
      applyPassState
    })
    equal(accepted.status, 'task')
    equal(accepted.name, 'Second')
    deepEqual(accepted.traversed, ['Prepare', 'Route', 'Second'])

    const rejected = interpretStateTransition(definition, {
      afterStateName: 'First',
      context: { approved: false },
      applyPassState
    })
    equal(rejected.status, 'failed')
    equal(rejected.name, 'Rejected')

    const completed = interpretStateTransition(definition, {
      afterStateName: 'Second',
      context: { approved: true },
      applyPassState
    })
    equal(completed.status, 'completed')
  })

  void test('never overwrites a Fail state with a completed transition', () => {
    const definition: StateMachineDefinition = {
      StartAt: 'Rejected',
      States: { Rejected: { Type: 'Fail', Error: 'REJECTED' } }
    }

    equal(interpretStateTransition(definition, {
      context: {},
      applyPassState
    }).status, 'failed')
    equal(interpretStateTransition(definition, {
      afterStateName: 'Rejected',
      context: {},
      applyPassState
    }).status, 'failed')
  })

  void test('rejects unmatched choices and immediate non-task loops', () => {
    throws(() => interpretStateTransition({
      StartAt: 'Route',
      States: {
        Route: {
          Type: 'Choice',
          Choices: [{ Variable: '$.approved', BooleanEquals: true, Next: 'Done' }]
        },
        Done: { Type: 'Succeed' }
      }
    }, {
      context: { approved: false },
      applyPassState
    }), /WORKFLOW_CHOICE_NOT_MATCHED/v)

    throws(() => interpretStateTransition({
      StartAt: 'LoopA',
      States: {
        LoopA: { Type: 'Pass', Next: 'LoopB' },
        LoopB: { Type: 'Pass', Next: 'LoopA' }
      }
    }, {
      context: {},
      applyPassState
    }), /WORKFLOW_IMMEDIATE_TRANSITION_LOOP/v)
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
