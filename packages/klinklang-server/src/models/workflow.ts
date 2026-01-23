import type { Workflow } from '@mudkipme/klinklang-prisma'
import type { StateMachineDefinition } from './asl.ts'
import { getNextStateName, getTaskState } from './asl.ts'
import WorkflowInstance from './workflow-instance.ts'
import type { WorkflowTrigger } from './workflow-type.ts'

export async function getWorkflowInstances (workflow: Workflow, start = 0, stop = 100): Promise<WorkflowInstance[]> {
  return await WorkflowInstance.getInstancesOfWorkflow(workflow.id, start, stop)
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
): Array<{ name: string; state: Record<string, unknown> }> {
  const definition = workflow.definition as unknown as StateMachineDefinition
  const currentState = getTaskState(definition, definition.StartAt)
  const linkedStates: Array<{ name: string; state: Record<string, unknown> }> = []
  const visited = new Set<string>()
  let currentName = definition.StartAt
  let current = currentState
  while (true) {
    if (visited.has(currentName)) {
      throw new Error('CIRCULAR_STATE_FOUND')
    }
    visited.add(currentName)
    linkedStates.push({ name: currentName, state: current as unknown as Record<string, unknown> })
    const nextName = getNextStateName(current)
    if (nextName === null) {
      break
    }
    currentName = nextName
    current = getTaskState(definition, currentName)
  }
  return linkedStates
}
