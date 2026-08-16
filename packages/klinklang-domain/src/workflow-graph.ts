import type { StateDefinition, StateMachineDefinition } from './index.js'
import { getStateTransitions } from './transitions.js'

export type WorkflowGraphEdgeKind = 'next' | 'choice' | 'default'

export interface WorkflowGraphNode {
  id: string
  state: StateDefinition
  isStart: boolean
}

export interface WorkflowGraphEdge {
  id: string
  source: string
  target: string
  kind: WorkflowGraphEdgeKind
  sourceHandle: string
  choiceIndex?: number
}

export interface WorkflowGraph {
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
}

const cloneDefinition = (definition: StateMachineDefinition): StateMachineDefinition => structuredClone(definition)

export function projectWorkflowGraph (definition: StateMachineDefinition): WorkflowGraph {
  const nodes = Object.entries(definition.States).map(([id, state]) => ({
    id,
    state,
    isStart: id === definition.StartAt
  }))
  const edges: WorkflowGraphEdge[] = []
  for (const [source, state] of Object.entries(definition.States)) {
    for (const transition of getStateTransitions(state)) {
      const choiceIndex = transition.kind === 'choice' ? transition.index : undefined
      const sourceHandle = transition.kind === 'choice'
        ? `choice:${transition.index}`
        : transition.kind
      edges.push({
        id: `${source}:${sourceHandle}:${transition.target}`,
        source,
        target: transition.target,
        kind: transition.kind,
        sourceHandle,
        ...(choiceIndex === undefined ? {} : { choiceIndex })
      })
    }
  }
  return { nodes, edges }
}

export function createUniqueStateName (definition: StateMachineDefinition, preferredName: string): string {
  const sanitized = preferredName.trim().replaceAll(/[^A-Za-z0-9_\-]+/gv, '_').replaceAll(/^_+|_+$/gv, '')
  const base = sanitized.length > 0 ? sanitized : 'State'
  if (!Object.hasOwn(definition.States, base)) return base
  let suffix = 2
  while (Object.hasOwn(definition.States, `${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}

export function addWorkflowState (
  definition: StateMachineDefinition,
  stateName: string,
  state: StateDefinition
): StateMachineDefinition {
  if (Object.hasOwn(definition.States, stateName)) throw new Error(`WORKFLOW_STATE_ALREADY_EXISTS: ${stateName}`)
  const next = cloneDefinition(definition)
  next.States[stateName] = structuredClone(state)
  return next
}

export function renameWorkflowState (
  definition: StateMachineDefinition,
  previousName: string,
  nextName: string
): StateMachineDefinition {
  const trimmed = nextName.trim()
  if (trimmed.length === 0) throw new Error('WORKFLOW_STATE_NAME_REQUIRED')
  if (!Object.hasOwn(definition.States, previousName)) throw new Error(`WORKFLOW_STATE_NOT_FOUND: ${previousName}`)
  if (previousName !== trimmed && Object.hasOwn(definition.States, trimmed)) {
    throw new Error(`WORKFLOW_STATE_ALREADY_EXISTS: ${trimmed}`)
  }
  if (previousName === trimmed) return definition

  const next = cloneDefinition(definition)
  const entries = Object.entries(next.States).map(([name, state]) => [
    name === previousName ? trimmed : name,
    state
  ] as const)
  next.States = Object.fromEntries(entries)
  if (next.StartAt === previousName) next.StartAt = trimmed

  for (const state of Object.values(next.States)) {
    if ((state.Type === 'Task' || state.Type === 'Pass') && state.Next === previousName) {
      state.Next = trimmed
    } else if (state.Type === 'Choice') {
      state.Choices = state.Choices.map(rule => rule.Next === previousName
        ? { ...rule, Next: trimmed }
        : rule)
      if (state.Default === previousName) state.Default = trimmed
    }
  }
  return next
}

export function updateWorkflowState (
  definition: StateMachineDefinition,
  stateName: string,
  state: StateDefinition
): StateMachineDefinition {
  if (!Object.hasOwn(definition.States, stateName)) throw new Error(`WORKFLOW_STATE_NOT_FOUND: ${stateName}`)
  const next = cloneDefinition(definition)
  next.States[stateName] = structuredClone(state)
  return next
}

export function removeWorkflowState (
  definition: StateMachineDefinition,
  stateName: string
): StateMachineDefinition {
  if (!Object.hasOwn(definition.States, stateName)) throw new Error(`WORKFLOW_STATE_NOT_FOUND: ${stateName}`)
  if (Object.keys(definition.States).length === 1) throw new Error('WORKFLOW_REQUIRES_A_STATE')
  const next = cloneDefinition(definition)
  next.States = Object.fromEntries(Object.entries(next.States).filter(([name]) => name !== stateName))
  if (next.StartAt === stateName) next.StartAt = Object.keys(next.States)[0]
  for (const state of Object.values(next.States)) {
    if ((state.Type === 'Task' || state.Type === 'Pass') && state.Next === stateName) {
      delete state.Next
      state.End = true
    } else if (state.Type === 'Choice') {
      state.Choices = state.Choices.filter(rule => rule.Next !== stateName)
      if (state.Default === stateName) delete state.Default
    }
  }
  return next
}

export function connectWorkflowStates (
  definition: StateMachineDefinition,
  sourceName: string,
  targetName: string,
  sourceHandle = 'next'
): StateMachineDefinition {
  if (!Object.hasOwn(definition.States, sourceName)) throw new Error(`WORKFLOW_STATE_NOT_FOUND: ${sourceName}`)
  if (!Object.hasOwn(definition.States, targetName)) throw new Error(`WORKFLOW_STATE_NOT_FOUND: ${targetName}`)
  const next = cloneDefinition(definition)
  const source = next.States[sourceName]
  if (source.Type === 'Task' || source.Type === 'Pass') {
    source.Next = targetName
    delete source.End
    return next
  }
  if (source.Type === 'Choice') {
    if (sourceHandle === 'default') {
      source.Default = targetName
      return next
    }
    const match = /^choice:(?<index>\d+)$/v.exec(sourceHandle)
    const choiceIndex = match?.groups?.index === undefined ? Number.NaN : Number(match.groups.index)
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= source.Choices.length) {
      throw new Error(`WORKFLOW_CHOICE_HANDLE_NOT_FOUND: ${sourceHandle}`)
    }
    source.Choices[choiceIndex] = { ...source.Choices[choiceIndex], Next: targetName }
    return next
  }
  throw new Error(`WORKFLOW_STATE_NOT_CONNECTABLE: ${sourceName}`)
}

export function validateWorkflowGraph (definition: StateMachineDefinition): string[] {
  const issues: string[] = []
  const states = definition.States
  const stateNames = Object.keys(states)
  if (stateNames.length === 0) return ['definition.States: must define at least one state']
  if (!Object.hasOwn(states, definition.StartAt)) {
    issues.push(`definition.StartAt: ${definition.StartAt} does not exist in States`)
  }

  const edges = new Map<string, Set<string>>()
  const terminals = new Set<string>()
  for (const [stateName, state] of Object.entries(states)) {
    if (state.Type === 'Task' || state.Type === 'Pass') {
      const hasNext = state.Next !== undefined
      const hasEnd = state.End === true
      if (hasNext && hasEnd) issues.push(`States.${stateName}: cannot have both End and Next`)
      if (!hasNext && !hasEnd) issues.push(`States.${stateName}.Next: must be provided when End is not true`)
      if (hasEnd) terminals.add(stateName)
    } else if (state.Type === 'Succeed' || state.Type === 'Fail') {
      terminals.add(stateName)
    } else if (state.Choices.length === 0) {
      issues.push(`States.${stateName}.Choices: must contain at least one choice`)
    }
    for (const transition of getStateTransitions(state)) {
      const path = transition.kind === 'choice'
        ? `States.${stateName}.Choices.${transition.index}.Next`
        : transition.kind === 'default'
          ? `States.${stateName}.Default`
          : `States.${stateName}.Next`
      if (Object.hasOwn(states, transition.target)) {
        const targets = edges.get(stateName) ?? new Set<string>()
        targets.add(transition.target)
        edges.set(stateName, targets)
      } else {
        issues.push(`${path}: state ${transition.target} does not exist`)
      }
    }
  }
  if (terminals.size === 0) issues.push('definition: workflow must include at least one terminal state')

  const reachable = new Set<string>()
  const pending = Object.hasOwn(states, definition.StartAt) ? [definition.StartAt] : []
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined || reachable.has(current)) continue
    reachable.add(current)
    for (const target of edges.get(current) ?? []) pending.push(target)
  }

  const reverseEdges = new Map<string, Set<string>>()
  for (const [source, targets] of edges) {
    for (const target of targets) {
      const sources = reverseEdges.get(target) ?? new Set<string>()
      sources.add(source)
      reverseEdges.set(target, sources)
    }
  }
  const canReachTerminal = new Set<string>()
  const reversePending = [...terminals]
  while (reversePending.length > 0) {
    const current = reversePending.pop()
    if (current === undefined || canReachTerminal.has(current)) continue
    canReachTerminal.add(current)
    for (const source of reverseEdges.get(current) ?? []) reversePending.push(source)
  }
  for (const stateName of reachable) {
    if (!canReachTerminal.has(stateName)) {
      issues.push(`States.${stateName}: cannot reach a terminal state (endless loop)`)
    }
  }
  return issues
}
