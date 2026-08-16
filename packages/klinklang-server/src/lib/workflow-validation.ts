import {
  validateWorkflowGraph,
  workflowCreateRequestSchema,
  workflowUpdateRequestSchema,
  type StateMachineDefinition,
  type WorkflowCreateRequest,
  type WorkflowTrigger,
  type WorkflowUpdateRequest
} from '@mudkipme/klinklang-domain'
import { CronExpressionParser } from 'cron-parser'
import { isActionType, validateActionInput } from '../actions/register.ts'
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

  return validateWorkflowUpdateData(parsed.data, base)
}

export function validateWorkflowUpdateData (
  data: WorkflowUpdateRequest,
  base: WorkflowUpdateBase
): { data: WorkflowUpdatePayload | null; issues: string[] } {
  const issues: string[] = []
  const triggers = data.triggers ?? base.triggers
  const triggerIssues = validateTriggers(triggers)
  issues.push(...triggerIssues)

  const definition = data.definition ?? base.definition
  const definitionIssues = validateStateMachineDefinition(definition)
  issues.push(...definitionIssues)

  if (issues.length > 0) {
    return { data: null, issues }
  }

  return {
    data: {
      name: data.name ?? base.name,
      isPrivate: data.isPrivate ?? base.isPrivate,
      enabled: data.enabled ?? base.enabled,
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

  return validateWorkflowCreateData(parsed.data)
}

export function validateWorkflowCreateData (
  data: WorkflowCreateRequest
): { data: WorkflowCreatePayload | null; issues: string[] } {
  const { triggers, definition } = data
  const issues = [
    ...validateTriggers(triggers),
    ...validateStateMachineDefinition(definition)
  ]

  if (issues.length > 0) {
    return { data: null, issues }
  }

  return {
    data: {
      name: data.name,
      isPrivate: data.isPrivate,
      enabled: data.enabled,
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
      } catch (error) {
        issues.push(`triggers.${index}.pattern: invalid cron pattern`)
      }
    } else if (trigger.type === 'TRIGGER_EVENTBUS') {
      validateJSONPath(trigger.throttleKeyPath, `triggers.${index}.throttleKeyPath`, issues)
    }
  })
  return issues
}

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
  const issues = validateWorkflowGraph(definition)
  const states = definition.States

  for (const [stateName, state] of Object.entries(states)) {
    switch (state.Type) {
      case 'Task': {
        if (!isActionType(state.Resource)) {
          issues.push(`States.${stateName}.Resource: unsupported resource ${state.Resource}`)
        } else if (state.Parameters !== undefined && !hasDynamicParameter(state.Parameters)) {
          const inputIssues = validateActionInput(
            state.Resource,
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
  }

  return issues
}
