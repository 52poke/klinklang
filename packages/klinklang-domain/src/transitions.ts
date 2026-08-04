import { JSONPath } from 'jsonpath-plus'
import safeRegex from 'safe-regex'
import type {
  ChoiceRule,
  ChoiceRuleCondition,
  ChoiceState,
  FailState,
  PassState,
  StateDefinition,
  StateMachineDefinition,
  SucceedState,
  TaskState
} from './index.js'

export type StateTransition =
  | { kind: 'next'; target: string }
  | { kind: 'choice'; target: string; rule: ChoiceRule; index: number }
  | { kind: 'default'; target: string }

export function getState (definition: StateMachineDefinition, stateName: string): StateDefinition {
  if (!Object.hasOwn(definition.States, stateName)) {
    throw new Error(`WORKFLOW_STATE_NOT_FOUND: ${stateName}`)
  }
  return definition.States[stateName]
}

export function getStateTransitions (state: StateDefinition): StateTransition[] {
  switch (state.Type) {
    case 'Task':
    case 'Pass':
      return state.End === true || state.Next === undefined ? [] : [{ kind: 'next', target: state.Next }]
    case 'Choice': {
      const transitions: StateTransition[] = state.Choices.map((rule, index) => ({
        kind: 'choice', target: rule.Next, rule, index
      }))
      if (state.Default !== undefined) {
        transitions.push({ kind: 'default', target: state.Default })
      }
      return transitions
    }
    case 'Succeed':
    case 'Fail':
      return []
  }
}

function getJsonPathValue (context: Record<string, unknown>, path: string): unknown {
  return JSONPath<unknown[]>({ json: context, path })[0]
}

function compareNumericPath (
  value: unknown,
  context: Record<string, unknown>,
  path: string,
  compare: (left: number, right: number) => boolean
): boolean {
  const right = getJsonPathValue(context, path)
  return typeof value === 'number' && typeof right === 'number' && compare(value, right)
}

function evaluateChoiceRule (rule: ChoiceRule | ChoiceRuleCondition, context: Record<string, unknown>): boolean {
  if ('And' in rule) return rule.And.every(entry => evaluateChoiceRule(entry, context))
  if ('Or' in rule) return rule.Or.some(entry => evaluateChoiceRule(entry, context))
  if ('Not' in rule) return !evaluateChoiceRule(rule.Not, context)

  const value = getJsonPathValue(context, rule.Variable)
  if ('StringEquals' in rule) return value === rule.StringEquals
  if ('StringMatches' in rule) {
    if (typeof value !== 'string') return false
    if (!safeRegex(rule.StringMatches)) throw new Error('UNSAFE_STRING_MATCHES_REGEX')
    return new RegExp(rule.StringMatches, 'v').test(value)
  }
  if ('NumericEquals' in rule) return typeof value === 'number' && value === rule.NumericEquals
  if ('NumericEqualsPath' in rule) return compareNumericPath(value, context, rule.NumericEqualsPath, (a, b) => a === b)
  if ('NumericLessThan' in rule) return typeof value === 'number' && value < rule.NumericLessThan
  if ('NumericLessThanPath' in rule) return compareNumericPath(value, context, rule.NumericLessThanPath, (a, b) => a < b)
  if ('NumericGreaterThan' in rule) return typeof value === 'number' && value > rule.NumericGreaterThan
  if ('NumericGreaterThanPath' in rule) return compareNumericPath(value, context, rule.NumericGreaterThanPath, (a, b) => a > b)
  if ('NumericLessThanEquals' in rule) return typeof value === 'number' && value <= rule.NumericLessThanEquals
  if ('NumericLessThanEqualsPath' in rule) return compareNumericPath(value, context, rule.NumericLessThanEqualsPath, (a, b) => a <= b)
  if ('NumericGreaterThanEquals' in rule) return typeof value === 'number' && value >= rule.NumericGreaterThanEquals
  if ('NumericGreaterThanEqualsPath' in rule) return compareNumericPath(value, context, rule.NumericGreaterThanEqualsPath, (a, b) => a >= b)
  if ('BooleanEquals' in rule) return typeof value === 'boolean' && value === rule.BooleanEquals
  if ('IsPresent' in rule) return rule.IsPresent ? value !== undefined : value === undefined
  if ('IsNull' in rule) return rule.IsNull ? value === null : value !== null
  if ('IsString' in rule) return rule.IsString ? typeof value === 'string' : typeof value !== 'string'
  if ('IsNumeric' in rule) return rule.IsNumeric ? typeof value === 'number' : typeof value !== 'number'
  return false
}

export function resolveChoiceNext (state: ChoiceState, context: Record<string, unknown>): string | null {
  const transitions = getStateTransitions(state)
  const selected = transitions.find(candidate =>
    candidate.kind === 'choice' && evaluateChoiceRule(candidate.rule, context)
  )
  return selected?.target ?? transitions.find(candidate => candidate.kind === 'default')?.target ?? null
}

export type StateTransitionResult =
  | { status: 'task'; name: string; state: TaskState; context: Record<string, unknown>; traversed: string[] }
  | { status: 'completed'; name: string; state: TaskState | PassState | SucceedState; context: Record<string, unknown>; traversed: string[] }
  | { status: 'failed'; name: string; state: FailState; context: Record<string, unknown>; traversed: string[] }

export interface StateTransitionOptions {
  context: Record<string, unknown>
  afterStateName?: string
  applyPassState: (state: PassState, context: Record<string, unknown>) => Record<string, unknown>
}

function resolveOrigin (
  definition: StateMachineDefinition,
  options: StateTransitionOptions
): StateTransitionResult | string {
  if (options.afterStateName === undefined) return definition.StartAt
  const current = getState(definition, options.afterStateName)
  if (current.Type === 'Fail') {
    return { status: 'failed', name: options.afterStateName, state: current, context: options.context, traversed: [] }
  }
  if (current.Type === 'Succeed') {
    return { status: 'completed', name: options.afterStateName, state: current, context: options.context, traversed: [] }
  }
  if (current.Type === 'Choice') {
    const selected = resolveChoiceNext(current, options.context)
    if (selected === null) throw new Error(`WORKFLOW_CHOICE_NOT_MATCHED: ${options.afterStateName}`)
    return selected
  }
  const transition = getStateTransitions(current).at(0)
  return transition?.target ?? {
    status: 'completed', name: options.afterStateName, state: current, context: options.context, traversed: []
  }
}

/** Interpret non-task states until the next task or terminal state is reached. */
export function interpretStateTransition (
  definition: StateMachineDefinition,
  options: StateTransitionOptions
): StateTransitionResult {
  const origin = resolveOrigin(definition, options)
  if (typeof origin !== 'string') return origin

  let context = options.context
  let stateName = origin
  const traversed: string[] = []
  const visited = new Set<string>()
  while (true) {
    if (visited.has(stateName)) throw new Error(`WORKFLOW_IMMEDIATE_TRANSITION_LOOP: ${stateName}`)
    visited.add(stateName)
    traversed.push(stateName)
    const state = getState(definition, stateName)
    switch (state.Type) {
      case 'Task': return { status: 'task', name: stateName, state, context, traversed }
      case 'Succeed': return { status: 'completed', name: stateName, state, context, traversed }
      case 'Fail': return { status: 'failed', name: stateName, state, context, traversed }
      case 'Pass': {
        context = options.applyPassState(state, context)
        const transition = getStateTransitions(state).at(0)
        if (transition === undefined) return { status: 'completed', name: stateName, state, context, traversed }
        stateName = transition.target
        break
      }
      case 'Choice': {
        const selected = resolveChoiceNext(state, context)
        if (selected === null) throw new Error(`WORKFLOW_CHOICE_NOT_MATCHED: ${stateName}`)
        stateName = selected
        break
      }
    }
  }
}
