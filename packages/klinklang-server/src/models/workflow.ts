import type { WorkflowTrigger } from '@mudkipme/klinklang-domain'
import type { Workflow } from '@mudkipme/klinklang-prisma'
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
