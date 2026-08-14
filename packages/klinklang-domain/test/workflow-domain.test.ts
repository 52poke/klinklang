import { deepEqual, equal, ok } from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  eventPredicateSchema,
  getStateTransitions,
  choiceRuleSchema,
  workflowCreateRequestSchema,
  workflowDetailResponseSchema,
  workflowInstanceSchema,
  workflowMetadataSchema
} from '../src/index.ts'

const workflowId = '00000000-0000-4000-8000-000000000001'

void describe('workflow domain schemas', () => {
  void test('derives a complete workflow request from validated input', () => {
    const workflow = workflowCreateRequestSchema.parse({
      name: 'Shared workflow',
      isPrivate: false,
      enabled: true,
      triggers: [{ type: 'TRIGGER_MANUAL' }],
      definition: {
        StartAt: 'Done',
        States: { Done: { Type: 'Succeed' } }
      }
    })

    equal(workflow.definition.States.Done.Type, 'Succeed')
    equal(workflow.triggers[0].type, 'TRIGGER_MANUAL')
  })

  void test('rejects malformed states and unsafe event predicates', () => {
    const malformed = workflowCreateRequestSchema.safeParse({
      name: 'Malformed',
      isPrivate: false,
      enabled: true,
      triggers: [],
      definition: {
        StartAt: 'Task',
        States: { Task: { Type: 'Task' } }
      }
    })
    const unsafePredicate = eventPredicateSchema.safeParse({
      op: 'matches',
      path: '/title',
      value: '(a+)+$'
    })

    equal(malformed.success, false)
    equal(unsafePredicate.success, false)
  })

  void test('keeps API metadata separate from the workflow definition', () => {
    const metadata = {
      id: workflowId,
      name: 'Metadata',
      isPrivate: false,
      enabled: true,
      triggers: [],
      currentRevision: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      userId: null
    }
    ok(!workflowMetadataSchema.safeParse({ ...metadata, definition: {} }).success)
    ok(workflowDetailResponseSchema.safeParse({
      workflow: metadata,
      definition: { StartAt: 'Done', States: { Done: { Type: 'Succeed' } } }
    }).success)
  })

  void test('describes outgoing edges consistently for runtime and visualization', () => {
    const choice = {
      Type: 'Choice' as const,
      Choices: [{ Variable: '$.approved', BooleanEquals: true, Next: 'Accepted' }],
      Default: 'Rejected'
    }

    deepEqual(getStateTransitions(choice), [
      { kind: 'choice', target: 'Accepted', rule: choice.Choices[0], index: 0 },
      { kind: 'default', target: 'Rejected' }
    ])
    deepEqual(getStateTransitions({ Type: 'Fail', Error: 'REJECTED' }), [])
  })

  void test('extends recursive choice conditions with Next only at the top level', () => {
    ok(choiceRuleSchema.safeParse({
      And: [
        { Variable: '$.kind', StringEquals: 'article' },
        { Not: { Variable: '$.archived', BooleanEquals: true } }
      ],
      Next: 'Publish'
    }).success)
    equal(choiceRuleSchema.safeParse({
      And: [{ Variable: '$.kind', StringEquals: 'article', Next: 'Nested' }],
      Next: 'Publish'
    }).success, false)
  })

  void test('parses execution inspection history and remains compatible with legacy records', () => {
    const legacy = workflowInstanceSchema.parse({
      workflowId,
      instanceId: '00000000-0000-4000-8000-000000000002',
      firstJobId: '00000000-0000-4000-8000-000000000003',
      status: 'pending',
      createdAt: 1,
      context: {}
    })
    deepEqual(legacy.steps, [])

    const cancelled = workflowInstanceSchema.safeParse({
      ...legacy,
      status: 'cancelled',
      failureReason: 'Cancelled by user.',
      steps: [{
        jobId: legacy.firstJobId,
        stateName: 'Fetch',
        actionType: 'REQUEST',
        status: 'cancelled',
        attempts: 0,
        queuedAt: 1,
        completedAt: 2,
        durationMs: 1,
        logs: [{ timestamp: 2, level: 'warn', message: 'Cancelled by user.' }]
      }]
    })
    equal(cancelled.success, true)
  })
})
