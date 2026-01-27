import { JSONPath } from 'jsonpath-plus'
import safeRegex from 'safe-regex'
import { render } from '../lib/template.ts'

export interface StateMachineDefinition {
  StartAt: string
  States: Record<string, StateDefinition>
}

export interface TaskState {
  Type: 'Task'
  Resource: string
  Parameters?: unknown
  InputPath?: string | null
  ResultPath?: string | null
  OutputPath?: string | null
  Next?: string
  End?: boolean
}

export interface ChoiceState {
  Type: 'Choice'
  Choices: ChoiceRule[]
  Default?: string
}

export interface PassState {
  Type: 'Pass'
  Parameters?: unknown
  InputPath?: string | null
  ResultPath?: string | null
  OutputPath?: string | null
  Next?: string
  End?: boolean
}

export interface SucceedState {
  Type: 'Succeed'
}

export interface FailState {
  Type: 'Fail'
  Error?: string
  Cause?: string
}

export type StateDefinition = TaskState | ChoiceState | PassState | SucceedState | FailState

export type ChoiceRule = {
  Next: string
} & ChoiceRuleCondition

export type ChoiceRuleCondition =
  | {
    Variable: string
    StringEquals: string
  }
  | {
    Variable: string
    StringMatches: string
  }
  | {
    Variable: string
    NumericEquals: number
  }
  | {
    Variable: string
    NumericEqualsPath: string
  }
  | {
    Variable: string
    NumericLessThan: number
  }
  | {
    Variable: string
    NumericLessThanPath: string
  }
  | {
    Variable: string
    NumericGreaterThan: number
  }
  | {
    Variable: string
    NumericGreaterThanPath: string
  }
  | {
    Variable: string
    NumericLessThanEquals: number
  }
  | {
    Variable: string
    NumericLessThanEqualsPath: string
  }
  | {
    Variable: string
    NumericGreaterThanEquals: number
  }
  | {
    Variable: string
    NumericGreaterThanEqualsPath: string
  }
  | {
    Variable: string
    BooleanEquals: boolean
  }
  | {
    Variable: string
    IsPresent: boolean
  }
  | {
    Variable: string
    IsNull: boolean
  }
  | {
    Variable: string
    IsString: boolean
  }
  | {
    Variable: string
    IsNumeric: boolean
  }
  | {
    And: ChoiceRuleCondition[]
  }
  | {
    Or: ChoiceRuleCondition[]
  }
  | {
    Not: ChoiceRuleCondition
  }

export function getState (definition: StateMachineDefinition, stateName: string): StateDefinition {
  const state = definition.States[stateName]
  switch (state.Type) {
    case 'Task':
    case 'Choice':
    case 'Pass':
    case 'Fail':
    case 'Succeed':
      return state
  }
  throw new Error('UNSUPPORTED_STATE_TYPE')
}

export function getTaskState (definition: StateMachineDefinition, stateName: string): TaskState {
  const state = getState(definition, stateName)
  if (state.Type !== 'Task') {
    throw new Error('WORKFLOW_TASK_STATE_NOT_FOUND')
  }
  return state
}

function getJsonPathValue (context: Record<string, unknown>, path: string): unknown {
  return JSONPath<unknown[]>({ json: context, path })[0]
}

function getNumericPathValue (context: Record<string, unknown>, path: string): number | null {
  const value = getJsonPathValue(context, path)
  return typeof value === 'number' ? value : null
}

function evaluateChoiceRule (rule: ChoiceRule | ChoiceRuleCondition, context: Record<string, unknown>): boolean {
  if ('And' in rule) {
    return rule.And.every(entry => evaluateChoiceRule(entry, context))
  }
  if ('Or' in rule) {
    return rule.Or.some(entry => evaluateChoiceRule(entry, context))
  }
  if ('Not' in rule) {
    return !evaluateChoiceRule(rule.Not, context)
  }

  const value = getJsonPathValue(context, rule.Variable)
  if ('StringEquals' in rule) {
    return value === rule.StringEquals
  }
  if ('StringMatches' in rule) {
    if (typeof value !== 'string') {
      return false
    }
    if (!safeRegex(rule.StringMatches)) {
      throw new Error('UNSAFE_STRING_MATCHES_REGEX')
    }
    const matcher = new RegExp(rule.StringMatches, 'v')
    return matcher.test(value)
  }
  if ('NumericEquals' in rule) {
    return typeof value === 'number' && value === rule.NumericEquals
  }
  if ('NumericEqualsPath' in rule) {
    const compare = getNumericPathValue(context, rule.NumericEqualsPath)
    return typeof value === 'number' && compare !== null && value === compare
  }
  if ('NumericLessThan' in rule) {
    return typeof value === 'number' && value < rule.NumericLessThan
  }
  if ('NumericLessThanPath' in rule) {
    const compare = getNumericPathValue(context, rule.NumericLessThanPath)
    return typeof value === 'number' && compare !== null && value < compare
  }
  if ('NumericGreaterThan' in rule) {
    return typeof value === 'number' && value > rule.NumericGreaterThan
  }
  if ('NumericGreaterThanPath' in rule) {
    const compare = getNumericPathValue(context, rule.NumericGreaterThanPath)
    return typeof value === 'number' && compare !== null && value > compare
  }
  if ('NumericLessThanEquals' in rule) {
    return typeof value === 'number' && value <= rule.NumericLessThanEquals
  }
  if ('NumericLessThanEqualsPath' in rule) {
    const compare = getNumericPathValue(context, rule.NumericLessThanEqualsPath)
    return typeof value === 'number' && compare !== null && value <= compare
  }
  if ('NumericGreaterThanEquals' in rule) {
    return typeof value === 'number' && value >= rule.NumericGreaterThanEquals
  }
  if ('NumericGreaterThanEqualsPath' in rule) {
    const compare = getNumericPathValue(context, rule.NumericGreaterThanEqualsPath)
    return typeof value === 'number' && compare !== null && value >= compare
  }
  if ('BooleanEquals' in rule) {
    return typeof value === 'boolean' && value === rule.BooleanEquals
  }
  if ('IsPresent' in rule) {
    return rule.IsPresent ? value !== undefined : value === undefined
  }
  if ('IsNull' in rule) {
    return rule.IsNull ? value === null : value !== null
  }
  if ('IsString' in rule) {
    return rule.IsString ? typeof value === 'string' : typeof value !== 'string'
  }
  if ('IsNumeric' in rule) {
    return rule.IsNumeric ? typeof value === 'number' : typeof value !== 'number'
  }
  return false
}

export function resolveChoiceNext (state: ChoiceState, context: Record<string, unknown>): string | null {
  for (const choice of state.Choices) {
    if (evaluateChoiceRule(choice, context)) {
      return choice.Next
    }
  }
  return state.Default ?? null
}

export function resolveNextTaskState (
  definition: StateMachineDefinition,
  currentStateName: string,
  context: Record<string, unknown>
): { name: string; state: TaskState } | null {
  const current = getState(definition, currentStateName)
  if (current.Type === 'Fail' || current.Type === 'Succeed') {
    return null
  }
  const initialNextName = current.Type === 'Task'
    ? (current.End === true ? null : (current.Next ?? null))
    : current.Type === 'Pass'
      ? (current.End === true ? null : (current.Next ?? null))
      : resolveChoiceNext(current, context)
  let nextName = initialNextName

  while (nextName !== null) {
    const nextState = getState(definition, nextName)
    if (nextState.Type === 'Task') {
      return { name: nextName, state: nextState }
    }
    if (nextState.Type === 'Choice') {
      nextName = resolveChoiceNext(nextState, context)
      continue
    }
    if (nextState.Type === 'Pass') {
      nextName = nextState.End === true ? null : (nextState.Next ?? null)
      continue
    }
    switch (nextState.Type) {
      case 'Succeed':
      case 'Fail':
        return null
    }
    throw new Error('UNSUPPORTED_STATE_TYPE')
  }
  return null
}

function applyInputPath (context: Record<string, unknown>, inputPath?: string | null): Record<string, unknown> {
  if (inputPath === null) {
    return {}
  }
  if (inputPath === undefined || inputPath === '$') {
    return context
  }
  const selected = getJsonPathValue(context, inputPath)
  if (selected !== null && typeof selected === 'object') {
    return selected as Record<string, unknown>
  }
  return { value: selected }
}

function resolveParameters (parameters: unknown, context: Record<string, unknown>): unknown {
  if (Array.isArray(parameters)) {
    return parameters.map(value => resolveParameters(value, context))
  }
  if (parameters === null || typeof parameters !== 'object') {
    return parameters
  }

  if ('Template' in parameters && Object.keys(parameters).length === 1) {
    const templateValue = (parameters as { Template: unknown }).Template
    if (typeof templateValue === 'string') {
      return render(templateValue, context)
    }
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parameters)) {
    if (key.endsWith('.$') && typeof value === 'string') {
      const targetKey = key.slice(0, -2)
      result[targetKey] = getJsonPathValue(context, value)
    } else {
      result[key] = resolveParameters(value, context)
    }
  }
  return result
}

function applyResultPath (
  context: Record<string, unknown>,
  result: unknown,
  resultPath?: string | null
): Record<string, unknown> {
  if (resultPath === null) {
    return context
  }
  if (resultPath === undefined || resultPath === '$') {
    return (result !== null && typeof result === 'object') ? (result as Record<string, unknown>) : { payload: result }
  }

  if (!resultPath.startsWith('$.')) {
    throw new Error('UNSUPPORTED_RESULT_PATH')
  }

  const pathSegments = resultPath.slice(2).split('.')
  let current: Record<string, unknown> = context
  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index]
    const existing = current[segment]
    if (existing === undefined || existing === null || typeof existing !== 'object') {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }
  current[pathSegments[pathSegments.length - 1]] = result
  return context
}

function applyOutputPath (context: Record<string, unknown>, outputPath?: string | null): Record<string, unknown> {
  if (outputPath === null) {
    return {}
  }
  if (outputPath === undefined || outputPath === '$') {
    return context
  }
  const selected = getJsonPathValue(context, outputPath)
  if (selected !== null && typeof selected === 'object') {
    return selected as Record<string, unknown>
  }
  return { value: selected }
}

export function buildStateInput (state: TaskState | PassState, context: Record<string, unknown>): unknown {
  const inputContext = applyInputPath(context, state.InputPath)
  if (state.Parameters === undefined) {
    return inputContext
  }
  return resolveParameters(state.Parameters, inputContext)
}

export function applyStateOutput (
  state: TaskState | PassState,
  context: Record<string, unknown>,
  result: unknown
): Record<string, unknown> {
  const merged = applyResultPath(context, result, state.ResultPath)
  return applyOutputPath(merged, state.OutputPath)
}

export function applyPassState (
  state: PassState,
  context: Record<string, unknown>
): Record<string, unknown> {
  const output = buildStateInput(state, context)
  return applyStateOutput(state, context, output)
}
