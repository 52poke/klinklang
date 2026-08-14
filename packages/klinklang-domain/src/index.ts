import safeRegex from 'safe-regex'
import { z } from 'zod'

export * from './transitions.js'

export const jsonValueSchema = z.json()
export type JsonValue = z.infer<typeof jsonValueSchema>

export interface EventPredicate {
  op: 'contains' | 'defined' | 'undefined' | 'ends' | 'starts' | 'less' | 'more' | 'in' | 'matches' | 'test' | 'type' | 'contained' | 'intersects' | 'and' | 'or' | 'not'
  path?: string
  value?: unknown
  apply?: EventPredicate[]
  ignore_case?: boolean
}

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

export const eventPredicateSchema: z.ZodType<EventPredicate> = z.lazy(() => z.looseObject({
  op: z.enum(predicateOps),
  path: z.string().startsWith('/').optional(),
  value: z.unknown().optional(),
  apply: z.array(eventPredicateSchema).min(1).optional(),
  ignore_case: z.boolean().optional()
}).superRefine((predicate, context) => {
  const secondOrder = ['and', 'or', 'not'].includes(predicate.op)
  if (secondOrder && predicate.apply === undefined) {
    context.addIssue({ code: 'custom', message: 'apply is required', path: ['apply'] })
  } else if (!secondOrder && predicate.path === undefined) {
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
    } catch (error) {
      context.addIssue({ code: 'custom', message: 'invalid regular expression', path: ['value'] })
    }
  }
}))

export const eventBusTriggerSchema = z.object({
  type: z.literal('TRIGGER_EVENTBUS'),
  topic: z.string().min(1),
  predicate: eventPredicateSchema.optional(),
  throttle: z.number().int().positive().optional(),
  throttleKeyPath: z.string().min(1).optional()
}).strict().superRefine((trigger, context) => {
  if ((trigger.throttle !== undefined) !== (trigger.throttleKeyPath !== undefined)) {
    context.addIssue({
      code: 'custom',
      message: 'throttle and throttleKeyPath must be provided together'
    })
  }
})

export const cronTriggerSchema = z.object({
  type: z.literal('TRIGGER_CRON'),
  pattern: z.string().min(1)
}).strict()

export const manualTriggerSchema = z.object({
  type: z.literal('TRIGGER_MANUAL')
}).strict()

export const workflowTriggerSchema = z.discriminatedUnion('type', [
  eventBusTriggerSchema,
  cronTriggerSchema,
  manualTriggerSchema
])
export const workflowTriggersSchema = z.array(workflowTriggerSchema)
export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>

export type ChoiceRuleCondition =
  | { Variable: string; StringEquals: string }
  | { Variable: string; StringMatches: string }
  | { Variable: string; NumericEquals: number }
  | { Variable: string; NumericEqualsPath: string }
  | { Variable: string; NumericLessThan: number }
  | { Variable: string; NumericLessThanPath: string }
  | { Variable: string; NumericGreaterThan: number }
  | { Variable: string; NumericGreaterThanPath: string }
  | { Variable: string; NumericLessThanEquals: number }
  | { Variable: string; NumericLessThanEqualsPath: string }
  | { Variable: string; NumericGreaterThanEquals: number }
  | { Variable: string; NumericGreaterThanEqualsPath: string }
  | { Variable: string; BooleanEquals: boolean }
  | { Variable: string; IsPresent: boolean }
  | { Variable: string; IsNull: boolean }
  | { Variable: string; IsString: boolean }
  | { Variable: string; IsNumeric: boolean }
  | { And: ChoiceRuleCondition[] }
  | { Or: ChoiceRuleCondition[] }
  | { Not: ChoiceRuleCondition }

export const choiceRuleConditionSchema: z.ZodType<ChoiceRuleCondition> = z.lazy(() => z.union([
  z.object({ Variable: z.string().min(1), StringEquals: z.string() }).strict(),
  z.object({ Variable: z.string().min(1), StringMatches: z.string() }).strict(),
  z.object({ Variable: z.string().min(1), NumericEquals: z.number() }).strict(),
  z.object({ Variable: z.string().min(1), NumericEqualsPath: z.string().min(1) }).strict(),
  z.object({ Variable: z.string().min(1), NumericLessThan: z.number() }).strict(),
  z.object({ Variable: z.string().min(1), NumericLessThanPath: z.string().min(1) }).strict(),
  z.object({ Variable: z.string().min(1), NumericGreaterThan: z.number() }).strict(),
  z.object({ Variable: z.string().min(1), NumericGreaterThanPath: z.string().min(1) }).strict(),
  z.object({ Variable: z.string().min(1), NumericLessThanEquals: z.number() }).strict(),
  z.object({ Variable: z.string().min(1), NumericLessThanEqualsPath: z.string().min(1) }).strict(),
  z.object({ Variable: z.string().min(1), NumericGreaterThanEquals: z.number() }).strict(),
  z.object({ Variable: z.string().min(1), NumericGreaterThanEqualsPath: z.string().min(1) }).strict(),
  z.object({ Variable: z.string().min(1), BooleanEquals: z.boolean() }).strict(),
  z.object({ Variable: z.string().min(1), IsPresent: z.boolean() }).strict(),
  z.object({ Variable: z.string().min(1), IsNull: z.boolean() }).strict(),
  z.object({ Variable: z.string().min(1), IsString: z.boolean() }).strict(),
  z.object({ Variable: z.string().min(1), IsNumeric: z.boolean() }).strict(),
  z.object({ And: z.array(choiceRuleConditionSchema).min(1) }).strict(),
  z.object({ Or: z.array(choiceRuleConditionSchema).min(1) }).strict(),
  z.object({ Not: choiceRuleConditionSchema }).strict()
]))

export type ChoiceRule = ChoiceRuleCondition & { Next: string }

const choiceRuleWireSchema = z.object({
  Next: z.string().min(1)
}).loose().superRefine((value, context) => {
  const { Next, ...condition } = value
  const parsed = choiceRuleConditionSchema.safeParse(condition)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      context.addIssue({ ...issue, path: issue.path })
    }
  }
})

export const choiceRuleSchema: z.ZodType<ChoiceRule> = z.codec(
  choiceRuleWireSchema,
  z.custom<ChoiceRule>(),
  {
    decode: value => value as ChoiceRule,
    encode: value => value as z.output<typeof choiceRuleWireSchema>
  }
)

export const taskStateSchema = z.object({
  Type: z.literal('Task'),
  Resource: z.string().min(1),
  Parameters: z.unknown().optional(),
  InputPath: z.string().nullable().optional(),
  ResultPath: z.string().nullable().optional(),
  OutputPath: z.string().nullable().optional(),
  Next: z.string().min(1).optional(),
  End: z.boolean().optional()
}).strict()

export const passStateSchema = z.object({
  Type: z.literal('Pass'),
  Parameters: z.unknown().optional(),
  InputPath: z.string().nullable().optional(),
  ResultPath: z.string().nullable().optional(),
  OutputPath: z.string().nullable().optional(),
  Next: z.string().min(1).optional(),
  End: z.boolean().optional()
}).strict()

export const choiceStateSchema = z.object({
  Type: z.literal('Choice'),
  Choices: z.array(choiceRuleSchema).min(1),
  Default: z.string().min(1).optional()
}).strict()

export const succeedStateSchema = z.object({ Type: z.literal('Succeed') }).strict()
export const failStateSchema = z.object({
  Type: z.literal('Fail'),
  Error: z.string().optional(),
  Cause: z.string().optional()
}).strict()

export const stateDefinitionSchema = z.discriminatedUnion('Type', [
  taskStateSchema,
  passStateSchema,
  choiceStateSchema,
  succeedStateSchema,
  failStateSchema
])

export const stateMachineDefinitionSchema = z.object({
  StartAt: z.string().min(1),
  States: z.record(z.string(), stateDefinitionSchema)
}).strict()

export type TaskState = z.infer<typeof taskStateSchema>
export type PassState = z.infer<typeof passStateSchema>
export type ChoiceState = z.infer<typeof choiceStateSchema>
export type SucceedState = z.infer<typeof succeedStateSchema>
export type FailState = z.infer<typeof failStateSchema>
export type StateDefinition = z.infer<typeof stateDefinitionSchema>
export type StateMachineDefinition = z.infer<typeof stateMachineDefinitionSchema>

export const workflowCreateRequestSchema = z.object({
  name: z.string().min(1),
  isPrivate: z.boolean(),
  enabled: z.boolean(),
  triggers: workflowTriggersSchema,
  definition: stateMachineDefinitionSchema
}).strict()

export const workflowUpdateRequestSchema = workflowCreateRequestSchema.partial().strict().superRefine((data, context) => {
  if (Object.keys(data).length === 0) {
    context.addIssue({ code: 'custom', message: 'payload must include at least one field' })
  }
})

export const workflowTriggerRequestSchema = z.object({ payload: z.unknown().optional() }).strict()

const paginationOffsetSchema = z.coerce.number().int().nonnegative()
const paginationLimitSchema = z.coerce.number().int().positive()
  .transform(limit => Math.min(limit, 200))

export const workflowIdParamsSchema = z.object({
  workflowId: z.uuid()
}).strict()

export const workflowInstanceParamsSchema = workflowIdParamsSchema.extend({
  instanceId: z.uuid()
}).strict()

export const workflowListQuerySchema = z.object({
  offset: paginationOffsetSchema.default(0),
  limit: paginationLimitSchema.default(20)
}).strict()

export const workflowInstancesQuerySchema = z.object({
  offset: paginationOffsetSchema.optional(),
  limit: paginationLimitSchema.optional(),
  start: paginationOffsetSchema.optional(),
  stop: paginationLimitSchema.optional()
}).strict()

export type WorkflowCreateRequest = z.infer<typeof workflowCreateRequestSchema>
export type WorkflowUpdateRequest = z.infer<typeof workflowUpdateRequestSchema>
export type WorkflowTriggerRequest = z.infer<typeof workflowTriggerRequestSchema>
export type WorkflowIdParams = z.infer<typeof workflowIdParamsSchema>
export type WorkflowInstanceParams = z.infer<typeof workflowInstanceParamsSchema>
export type WorkflowListQuery = z.infer<typeof workflowListQuerySchema>
export type WorkflowInstancesQuery = z.infer<typeof workflowInstancesQuerySchema>

export const workflowMetadataSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isPrivate: z.boolean(),
  enabled: z.boolean(),
  triggers: workflowTriggersSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  userId: z.uuid().nullable()
}).strict()

export const workflowStepLogSchema = z.object({
  timestamp: z.number().int(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string()
}).strict()

export const workflowStepExecutionSchema = z.object({
  jobId: z.uuid(),
  stateName: z.string(),
  actionType: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  failureReason: z.string().optional(),
  attempts: z.number().int().nonnegative(),
  queuedAt: z.number().int(),
  startedAt: z.number().int().optional(),
  completedAt: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  retryOfJobId: z.uuid().optional(),
  logs: z.array(workflowStepLogSchema)
}).strict()

export const workflowInstanceSchema = z.object({
  workflowId: z.uuid(),
  instanceId: z.uuid(),
  firstJobId: z.uuid(),
  currentJobId: z.uuid().optional(),
  currentStateName: z.string().optional(),
  status: z.enum(['pending', 'running', 'failed', 'completed', 'cancelled']),
  createdAt: z.number().int(),
  startedAt: z.number().int().optional(),
  completedAt: z.number().int().optional(),
  failureReason: z.string().optional(),
  trigger: workflowTriggerSchema.optional(),
  context: z.record(z.string(), z.unknown()),
  steps: z.array(workflowStepExecutionSchema).default([])
}).strict()

export type WorkflowMetadata = z.infer<typeof workflowMetadataSchema>
export type WorkflowInstance = z.infer<typeof workflowInstanceSchema>
export type WorkflowStepExecution = z.infer<typeof workflowStepExecutionSchema>
export type WorkflowStepLog = z.infer<typeof workflowStepLogSchema>

export const workflowListResponseSchema = z.object({ workflows: z.array(workflowMetadataSchema) }).strict()
export const workflowDetailResponseSchema = z.object({
  workflow: workflowMetadataSchema,
  definition: stateMachineDefinitionSchema
}).strict()
export const workflowInstancesResponseSchema = z.object({ instances: z.array(workflowInstanceSchema) }).strict()
export const workflowInstanceResponseSchema = z.object({ instance: workflowInstanceSchema }).strict()
export const workflowMutationResponseSchema = z.object({ workflow: workflowMetadataSchema }).strict()
export const workflowTriggerResponseSchema = z.object({
  workflow: workflowMetadataSchema,
  instance: workflowInstanceSchema
}).strict()
export const workflowValidationErrorResponseSchema = z.object({
  error: z.literal('INVALID_WORKFLOW'),
  issues: z.array(z.string())
}).strict()
export const requestValidationErrorResponseSchema = z.object({
  error: z.literal('INVALID_REQUEST'),
  issues: z.array(z.string())
}).strict()
export const workflowBadRequestResponseSchema = z.union([
  requestValidationErrorResponseSchema,
  workflowValidationErrorResponseSchema
])

export type WorkflowListResponse = z.infer<typeof workflowListResponseSchema>
export type WorkflowDetailResponse = z.infer<typeof workflowDetailResponseSchema>
export type WorkflowInstancesResponse = z.infer<typeof workflowInstancesResponseSchema>
export type WorkflowInstanceResponse = z.infer<typeof workflowInstanceResponseSchema>
export type WorkflowMutationResponse = z.infer<typeof workflowMutationResponseSchema>
export type WorkflowTriggerResponse = z.infer<typeof workflowTriggerResponseSchema>
export type WorkflowValidationErrorResponse = z.infer<typeof workflowValidationErrorResponseSchema>
export type RequestValidationErrorResponse = z.infer<typeof requestValidationErrorResponseSchema>
