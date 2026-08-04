import {
  getStateTransitions,
  workflowCreateRequestSchema,
  workflowUpdateRequestSchema,
  type StateMachineDefinition,
  type WorkflowCreateRequest,
  type WorkflowTrigger
} from '@mudkipme/klinklang-domain'
import { CronExpressionParser } from 'cron-parser'
import { validateActionInput } from '../actions/register.ts'
import { SUPPORTED_ACTION_TYPES } from '../actions/supported.ts'
import {
  validateChoiceConditionPaths,
  validateJSONPath,
  validateParameterPaths
} from './workflow-runtime-validation.ts'

export type WorkflowUpdatePayload = WorkflowCreateRequest
export type WorkflowCreatePayload = WorkflowCreateRequest
export type WorkflowUpdateBase = WorkflowCreateRequest

export function validateWorkflowUpdatePayload (
  payload: unknown,
  base: WorkflowUpdateBase
): { data: WorkflowUpdatePayload | null; issues: string[] } {
  const parsed = workflowUpdateRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      data: null,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length === 0 ? 'payload' : issue.path.join('.')
        return `${path}: ${issue.message}`
      })
    }
  }

  const issues: string[] = []
  const triggers = parsed.data.triggers ?? base.triggers
  const triggerIssues = validateTriggers(triggers)
  issues.push(...triggerIssues)

  const definition = parsed.data.definition ?? base.definition
  const definitionIssues = validateStateMachineDefinition(definition)
  issues.push(...definitionIssues)

  if (issues.length > 0) {
    return { data: null, issues }
  }

  return {
    data: {
      name: parsed.data.name ?? base.name,
      isPrivate: parsed.data.isPrivate ?? base.isPrivate,
      enabled: parsed.data.enabled ?? base.enabled,
      triggers,
      definition
    },
    issues: []
  }
}

export function validateWorkflowCreatePayload (
  payload: unknown
): { data: WorkflowCreatePayload | null; issues: string[] } {
  const parsed = workflowCreateRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      data: null,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length === 0 ? 'payload' : issue.path.join('.')
        return `${path}: ${issue.message}`
      })
    }
  }

  const { triggers, definition } = parsed.data
  const issues = [
    ...validateTriggers(triggers),
    ...validateStateMachineDefinition(definition)
  ]

  if (issues.length > 0) {
    return { data: null, issues }
  }

  return {
    data: {
      name: parsed.data.name,
      isPrivate: parsed.data.isPrivate,
      enabled: parsed.data.enabled,
      triggers,
      definition
    },
    issues: []
  }
}

function validateTriggers (triggers: WorkflowTrigger[]): string[] {
  const issues: string[] = []
  triggers.forEach((trigger, index) => {
    if (trigger.type === 'TRIGGER_CRON') {
      try {
        CronExpressionParser.parse(trigger.pattern)
      } catch {
        issues.push(`triggers.${index}.pattern: invalid cron pattern`)
      }
    } else if (trigger.type === 'TRIGGER_EVENTBUS') {
      validateJSONPath(trigger.throttleKeyPath, `triggers.${index}.throttleKeyPath`, issues)
    }
  })
  return issues
}

const SUPPORTED_ACTION_TYPE_SET = new Set<string>(SUPPORTED_ACTION_TYPES)

function hasDynamicParameter (value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasDynamicParameter)
  }
  if (value === null || typeof value !== 'object') {
    return false
  }
  return Object.entries(value).some(([key, entry]) => key.endsWith('.$') || hasDynamicParameter(entry))
}

function validateStateMachineDefinition (definition: StateMachineDefinition): string[] {
  const issues: string[] = []
  const states = definition.States
  const stateNames = Object.keys(states)

  if (stateNames.length === 0) {
    issues.push('definition.States: must define at least one state')
    return issues
  }

  if (!(definition.StartAt in states)) {
    issues.push(`definition.StartAt: ${definition.StartAt} does not exist in States`)
  }

  const edges = new Map<string, Set<string>>()
  const addEdge = (from: string, to: string, path: string): void => {
    if (!(to in states)) {
      issues.push(`${path}: state ${to} does not exist`)
      return
    }
    const list = edges.get(from) ?? new Set<string>()
    list.add(to)
    edges.set(from, list)
  }

  for (const [stateName, state] of Object.entries(states)) {
    switch (state.Type) {
      case 'Task': {
        if (!SUPPORTED_ACTION_TYPE_SET.has(state.Resource)) {
          issues.push(`States.${stateName}.Resource: unsupported resource ${state.Resource}`)
        } else if (state.Parameters !== undefined && !hasDynamicParameter(state.Parameters)) {
          const inputIssues = validateActionInput(
            state.Resource as (typeof SUPPORTED_ACTION_TYPES)[number],
            state.Parameters
          )
          issues.push(...inputIssues.map(issue => `States.${stateName}.Parameters.${issue}`))
        }
        validateJSONPath(state.InputPath, `States.${stateName}.InputPath`, issues)
        validateJSONPath(state.OutputPath, `States.${stateName}.OutputPath`, issues)
        if (state.ResultPath !== undefined && state.ResultPath !== null
          && !/^\$(?:\.[^.\[\]]+)*$/v.test(state.ResultPath)) {
          issues.push(`States.${stateName}.ResultPath: unsupported result path`)
        }
        validateParameterPaths(state.Parameters, `States.${stateName}.Parameters`, issues)
        validateNextOrEnd(stateName, state, issues)
        break
      }
      case 'Pass': {
        validateJSONPath(state.InputPath, `States.${stateName}.InputPath`, issues)
        validateJSONPath(state.OutputPath, `States.${stateName}.OutputPath`, issues)
        if (state.ResultPath !== undefined && state.ResultPath !== null
          && !/^\$(?:\.[^.\[\]]+)*$/v.test(state.ResultPath)) {
          issues.push(`States.${stateName}.ResultPath: unsupported result path`)
        }
        validateParameterPaths(state.Parameters, `States.${stateName}.Parameters`, issues)
        validateNextOrEnd(stateName, state, issues)
        break
      }
      case 'Choice': {
        for (let index = 0; index < state.Choices.length; index += 1) {
          const choice = state.Choices[index]
          validateChoiceConditionPaths(
            choice,
            `States.${stateName}.Choices.${index}`,
            issues
          )
        }
        break
      }
      case 'Succeed':
      case 'Fail':
        break
    }
    for (const transition of getStateTransitions(state)) {
      const path = transition.kind === 'choice'
        ? `States.${stateName}.Choices.${transition.index}.Next`
        : transition.kind === 'default'
          ? `States.${stateName}.Default`
          : `States.${stateName}.Next`
      addEdge(stateName, transition.target, path)
    }
  }

  const reachable = new Set<string>()
  if (definition.StartAt in states) {
    const stack = [definition.StartAt]
    while (stack.length > 0) {
      const current = stack.pop()
      if (current === undefined) {
        break
      }
      if (reachable.has(current)) {
        continue
      }
      reachable.add(current)
      const neighbors = edges.get(current)
      if (neighbors === undefined) {
        continue
      }
      for (const next of neighbors) {
        stack.push(next)
      }
    }
  }

  const terminals = new Set<string>()
  for (const [stateName, state] of Object.entries(states)) {
    const type = state.Type
    if (type === 'Succeed' || type === 'Fail') {
      terminals.add(stateName)
      continue
    }
    if ((type === 'Task' || type === 'Pass') && state.End === true) {
      terminals.add(stateName)
    }
  }

  if (terminals.size === 0) {
    issues.push('definition: workflow must include at least one terminal state')
  }

  const reverseEdges = new Map<string, Set<string>>()
  for (const [from, targets] of edges.entries()) {
    for (const target of targets) {
      const list = reverseEdges.get(target) ?? new Set<string>()
      list.add(from)
      reverseEdges.set(target, list)
    }
  }

  const canReachTerminal = new Set<string>()
  const reverseStack = Array.from(terminals)
  while (reverseStack.length > 0) {
    const current = reverseStack.pop()
    if (current === undefined) {
      break
    }
    if (canReachTerminal.has(current)) {
      continue
    }
    canReachTerminal.add(current)
    const prevs = reverseEdges.get(current)
    if (prevs === undefined) {
      continue
    }
    for (const prev of prevs) {
      reverseStack.push(prev)
    }
  }

  for (const stateName of reachable) {
    if (!canReachTerminal.has(stateName)) {
      issues.push(`States.${stateName}: cannot reach a terminal state (endless loop)`)
    }
  }

  return issues
}

function validateNextOrEnd (
  stateName: string,
  state: { Next?: string; End?: boolean },
  issues: string[]
): void {
  const end = state.End === true
  const hasNext = state.Next !== undefined
  if (end && hasNext) {
    issues.push(`States.${stateName}: cannot have both End and Next`)
  }
  if (!end) {
    if (state.Next === undefined) {
      issues.push(`States.${stateName}.Next: must be provided when End is not true`)
    }
  }
}
