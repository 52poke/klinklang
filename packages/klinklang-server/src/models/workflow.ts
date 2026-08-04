import type { StateDefinition, WorkflowTrigger } from '@mudkipme/klinklang-domain'
import type { Workflow } from '@mudkipme/klinklang-prisma'
import { getState, resolveChoiceNext } from './asl.ts'
import { parseWorkflowDefinition } from './workflow-data.ts'
import WorkflowInstance from './workflow-instance.ts'

export function canViewWorkflow (
  workflow: Pick<Workflow, 'isPrivate' | 'userId'>,
  userId?: string
): boolean {
  return !workflow.isPrivate || (userId !== undefined && workflow.userId === userId)
}

export async function getWorkflowInstances (workflow: Workflow, offset = 0, limit = 100): Promise<WorkflowInstance[]> {
  return await WorkflowInstance.getInstancesOfWorkflow(workflow.id, offset, limit)
}

export async function createInstanceWithWorkflow (
  workflow: Workflow,
  trigger?: WorkflowTrigger,
  payload?: unknown
): Promise<WorkflowInstance> {
  const definitionValue = workflow.definition
  if (definitionValue === null) {
    throw new Error('ERR_WORKFLOW_DEFINITION_NOT_FOUND')
  }
  return await WorkflowInstance.create(workflow, trigger, payload)
}

export function getLinkedStatesOfWorkflow (
  workflow: Workflow
): Array<{ name: string; state: StateDefinition }> {
  const definition = parseWorkflowDefinition(workflow)
  const currentState = getState(definition, definition.StartAt)
  const linkedStates: Array<{ name: string; state: StateDefinition }> = []
  const visited = new Set<string>()
  let currentName = definition.StartAt
  let current = currentState
  while (true) {
    if (visited.has(currentName)) {
      throw new Error('CIRCULAR_STATE_FOUND')
    }
    visited.add(currentName)
    linkedStates.push({ name: currentName, state: current })
    const nextName = current.Type === 'Task'
      ? (current.End === true ? null : (current.Next ?? null))
      : current.Type === 'Pass'
        ? (current.End === true ? null : (current.Next ?? null))
        : current.Type === 'Choice'
          ? resolveChoiceNext(current, {})
          : null
    if (nextName === null) {
      break
    }
    currentName = nextName
    current = getState(definition, currentName)
  }
  return linkedStates
}
