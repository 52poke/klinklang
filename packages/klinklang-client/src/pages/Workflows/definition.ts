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

export type ChoiceRule =
  & { Next: string }
  & (
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
    | { And: ChoiceRule[] }
    | { Or: ChoiceRule[] }
    | { Not: ChoiceRule }
  )

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
  return Object.entries(parameters as Record<string, unknown>)
    .map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    }))
}

export const formatChoiceRule = (rule: ChoiceRule): string => {
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
  if (visited.has(startName)) {
    return [{ kind: 'state', name: `${startName} (loop)`, state: definition.States[startName] }]
  }
  const state = definition.States[startName]
  const nextVisited = new Set(visited)
  nextVisited.add(startName)

  if (state.Type === 'Choice') {
    const branches: Branch[] = state.Choices.map((choice) => ({
      label: formatChoiceRule(choice),
      path: buildPath(definition, choice.Next, nextVisited)
    }))
    if (typeof state.Default === 'string' && state.Default.length > 0) {
      branches.push({
        label: 'Default',
        path: buildPath(definition, state.Default, nextVisited)
      })
    }
    return [{ kind: 'choice', name: startName, state, branches }]
  }

  const current: FlowItem = { kind: 'state', name: startName, state }
  if ('End' in state && state.End === true) {
    return [current]
  }
  if ('Next' in state && typeof state.Next === 'string') {
    return [current, ...buildPath(definition, state.Next, nextVisited)]
  }
  return [current]
}

export const collectStateNames = (definition: StateMachineDefinition): string[] => {
  const order: string[] = []
  const visited = new Set<string>()
  const visit = (name: string): void => {
    if (visited.has(name)) {
      return
    }
    visited.add(name)
    order.push(name)
    const state = definition.States[name]
    if (state.Type === 'Choice') {
      state.Choices.forEach(choice => {
        visit(choice.Next)
      })
      if (typeof state.Default === 'string' && state.Default.length > 0) {
        visit(state.Default)
      }
      return
    }
    if ('Next' in state && typeof state.Next === 'string') {
      visit(state.Next)
    }
  }
  visit(definition.StartAt)
  for (const name of Object.keys(definition.States)) {
    if (!visited.has(name)) {
      order.push(name)
    }
  }
  return order
}
