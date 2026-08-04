import type {
  ChoiceRule,
  ChoiceRuleCondition,
  ChoiceState,
  StateDefinition,
  StateMachineDefinition
} from '@mudkipme/klinklang-domain'
import { getState, getStateTransitions } from '@mudkipme/klinklang-domain'

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

export type FlowItem =
  | { kind: 'state'; name: string; state: StateDefinition }
  | { kind: 'choice'; name: string; state: ChoiceState; branches: Branch[] }

export interface Branch {
  label: string
  path: FlowItem[]
}

export const getStateLabel = (state: StateDefinition): string => {
  const type = state.Type
  const resource = state.Type === 'Task' ? state.Resource : ''
  return resource.length > 0 ? `${type} • ${resource}` : type
}

export const getIconMark = (state: StateDefinition): string => state.Type.slice(0, 1).toUpperCase()

export const getParameterRows = (state: StateDefinition): Array<{ key: string; value: string }> => {
  if (!('Parameters' in state)) {
    return []
  }
  const parameters = state.Parameters
  if (parameters === null || parameters === undefined || typeof parameters !== 'object') {
    return []
  }
  return Object.entries(parameters)
    .map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    }))
}

export const formatChoiceRule = (rule: ChoiceRule | ChoiceRuleCondition): string => {
  if ('And' in rule) {
    return `AND(${rule.And.map(formatChoiceRule).join(', ')})`
  }
  if ('Or' in rule) {
    return `OR(${rule.Or.map(formatChoiceRule).join(', ')})`
  }
  if ('Not' in rule) {
    return `NOT(${formatChoiceRule(rule.Not)})`
  }
  if ('Variable' in rule) {
    const variable = rule.Variable
    const operators = (Object.entries(rule) as Array<[string, unknown]>)
      .filter(([key]) => key !== 'Variable' && key !== 'Next')
    if (operators.length > 0) {
      const operator = operators[0][0]
      const value = operators[0][1]
      return `${variable} ${operator} ${String(value)}`
    }
  }
  return 'Condition'
}

export const buildPath = (
  definition: StateMachineDefinition,
  startName: string,
  visited: Set<string>
): FlowItem[] => {
  const state = getState(definition, startName)
  if (visited.has(startName)) {
    return [{ kind: 'state', name: `${startName} (loop)`, state }]
  }
  const nextVisited = new Set(visited)
  nextVisited.add(startName)
  const transitions = getStateTransitions(state)

  if (state.Type === 'Choice') {
    const branches: Branch[] = transitions.map(transition => ({
      label: transition.kind === 'choice' ? formatChoiceRule(transition.rule) : 'Default',
      path: buildPath(definition, transition.target, nextVisited)
    }))
    return [{ kind: 'choice', name: startName, state, branches }]
  }

  const current: FlowItem = { kind: 'state', name: startName, state }
  const transition = transitions.at(0)
  return transition === undefined
    ? [current]
    : [current, ...buildPath(definition, transition.target, nextVisited)]
}
