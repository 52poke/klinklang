import { JSONPath } from 'jsonpath-plus'
import { render } from '../lib/template.ts'

export interface StateMachineDefinition {
  StartAt: string
  States: Record<string, TaskState | undefined>
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

export function getTaskState (definition: StateMachineDefinition, stateName: string): TaskState {
  const state = definition.States[stateName]
  if (state === undefined) {
    throw new Error('WORKFLOW_STATE_NOT_FOUND')
  }
  return state
}

export function getNextStateName (state: TaskState): string | null {
  if (state.End === true) {
    return null
  }
  if (state.Next !== undefined) {
    return state.Next
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
  const selected = JSONPath<unknown[]>({ json: context, path: inputPath })[0]
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
      result[targetKey] = JSONPath<unknown[]>({ json: context, path: value })[0]
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
  const selected = JSONPath<unknown[]>({ json: context, path: outputPath })[0]
  if (selected !== null && typeof selected === 'object') {
    return selected as Record<string, unknown>
  }
  return { value: selected }
}

export function buildStateInput (state: TaskState, context: Record<string, unknown>): unknown {
  const inputContext = applyInputPath(context, state.InputPath)
  if (state.Parameters === undefined) {
    return inputContext
  }
  return resolveParameters(state.Parameters, inputContext)
}

export function applyStateOutput (
  state: TaskState,
  context: Record<string, unknown>,
  result: unknown
): Record<string, unknown> {
  const merged = applyResultPath(context, result, state.ResultPath)
  return applyOutputPath(merged, state.OutputPath)
}
