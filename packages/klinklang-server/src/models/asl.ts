import {
  getState,
  type PassState,
  type StateMachineDefinition,
  type TaskState
} from '@mudkipme/klinklang-domain'
import { JSONPath } from 'jsonpath-plus'
import { render } from '../lib/template.ts'

export type {
  ChoiceRule,
  ChoiceRuleCondition,
  ChoiceState,
  FailState,
  PassState,
  StateDefinition,
  StateMachineDefinition,
  SucceedState,
  TaskState
} from '@mudkipme/klinklang-domain'
export {
  getState,
  getStateTransitions,
  interpretStateTransition,
  resolveChoiceNext
} from '@mudkipme/klinklang-domain'

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
    const templateValue = parameters.Template
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
