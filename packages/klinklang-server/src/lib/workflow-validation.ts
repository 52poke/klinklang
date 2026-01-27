import { CronExpressionParser } from 'cron-parser'
import { z } from 'zod'
import { SUPPORTED_ACTION_TYPES } from '../actions/supported.ts'
import { choiceRuleSchema } from './workflow-choice-schema.ts'
import type { StateMachineDefinition } from '../models/asl.ts'
import type { WorkflowTrigger } from '../models/workflow-type.ts'

const eventBusTriggerSchema = z.object({
  type: z.literal('TRIGGER_EVENTBUS'),
  topic: z.string().min(1),
  predicate: z.unknown().optional(),
  throttle: z.number().int().positive().optional(),
  throttleKeyPath: z.string().min(1).optional()
}).strict().superRefine((trigger: z.infer<typeof eventBusTriggerSchema>, context) => {
  const hasThrottle = trigger.throttle !== undefined
  const hasThrottleKeyPath = trigger.throttleKeyPath !== undefined
  if (hasThrottle !== hasThrottleKeyPath) {
    context.addIssue({
      code: 'custom',
      message: 'throttle and throttleKeyPath must be provided together'
    })
  }
})

const cronTriggerSchema = z.object({
  type: z.literal('TRIGGER_CRON'),
  pattern: z.string().min(1)
}).strict()

const manualTriggerSchema = z.object({
  type: z.literal('TRIGGER_MANUAL')
}).strict()

const workflowTriggerSchema = z.discriminatedUnion('type', [
  eventBusTriggerSchema,
  cronTriggerSchema,
  manualTriggerSchema
])

const taskStateSchema = z.object({
  Type: z.literal('Task'),
  Resource: z.string().min(1),
  Parameters: z.unknown().optional(),
  InputPath: z.string().nullable().optional(),
  ResultPath: z.string().nullable().optional(),
  OutputPath: z.string().nullable().optional(),
  Next: z.string().min(1).optional(),
  End: z.boolean().optional()
}).strict()

const passStateSchema = z.object({
  Type: z.literal('Pass'),
  Parameters: z.unknown().optional(),
  InputPath: z.string().nullable().optional(),
  ResultPath: z.string().nullable().optional(),
  OutputPath: z.string().nullable().optional(),
  Next: z.string().min(1).optional(),
  End: z.boolean().optional()
}).strict()

const choiceStateSchema = z.object({
  Type: z.literal('Choice'),
  Choices: z.array(choiceRuleSchema).min(1),
  Default: z.string().min(1).optional()
}).strict()

const succeedStateSchema = z.object({
  Type: z.literal('Succeed')
}).strict()

const failStateSchema = z.object({
  Type: z.literal('Fail'),
  Error: z.string().optional(),
  Cause: z.string().optional()
}).strict()

const stateSchema = z.discriminatedUnion('Type', [
  taskStateSchema,
  passStateSchema,
  choiceStateSchema,
  succeedStateSchema,
  failStateSchema
])

const workflowDefinitionSchema = z.object({
  StartAt: z.string().min(1),
  States: z.record(z.string(), stateSchema)
}).strict()

const workflowUpdateSchema = z.object({
  name: z.string().min(1),
  isPrivate: z.boolean(),
  enabled: z.boolean(),
  triggers: z.array(workflowTriggerSchema),
  definition: workflowDefinitionSchema
}).partial().strict().superRefine((data: z.infer<typeof workflowUpdateSchema>, context) => {
  if (Object.keys(data).length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'payload must include at least one field'
    })
  }
})

export interface WorkflowUpdatePayload {
  name: string
  isPrivate: boolean
  enabled: boolean
  triggers: WorkflowTrigger[]
  definition: StateMachineDefinition
}

export interface WorkflowUpdateBase {
  name: string
  isPrivate: boolean
  enabled: boolean
  triggers: WorkflowTrigger[]
  definition: StateMachineDefinition
}

export function validateWorkflowUpdatePayload (
  payload: unknown,
  base: WorkflowUpdateBase
): { data: WorkflowUpdatePayload | null; issues: string[] } {
  const parsed = workflowUpdateSchema.safeParse(payload)
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
  const triggers = (parsed.data.triggers ?? base.triggers) as WorkflowTrigger[]
  const triggerIssues = validateTriggers(triggers)
  issues.push(...triggerIssues)

  const definition = (parsed.data.definition ?? base.definition) as StateMachineDefinition
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

function validateTriggers (triggers: WorkflowTrigger[]): string[] {
  const issues: string[] = []
  triggers.forEach((trigger, index) => {
    if (trigger.type === 'TRIGGER_CRON') {
      try {
        CronExpressionParser.parse(trigger.pattern)
      } catch {
        issues.push(`triggers.${index}.pattern: invalid cron pattern`)
      }
    }
  })
  return issues
}

const SUPPORTED_ACTION_TYPE_SET = new Set<string>(SUPPORTED_ACTION_TYPES)

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
        }
        validateNextOrEnd(stateName, state, addEdge, issues)
        break
      }
      case 'Pass': {
        validateNextOrEnd(stateName, state, addEdge, issues)
        break
      }
      case 'Choice': {
        for (let index = 0; index < state.Choices.length; index += 1) {
          const choice = state.Choices[index] as { Next: string }
          addEdge(stateName, choice.Next, `States.${stateName}.Choices.${index}.Next`)
        }
        if (state.Default !== undefined) {
          addEdge(stateName, state.Default, `States.${stateName}.Default`)
        }
        break
      }
      case 'Succeed':
      case 'Fail':
        break
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
  addEdge: (from: string, to: string, path: string) => void,
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
      return
    }
    addEdge(stateName, state.Next, `States.${stateName}.Next`)
  }
}
