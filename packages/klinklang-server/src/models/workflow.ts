import { diContainer } from '@fastify/awilix'
import type { Action, Workflow } from '@mudkipme/klinklang-prisma'
import { keyBy } from 'lodash-es'
import WorkflowInstance from './workflow-instance.js'
import type { WorkflowTrigger } from './workflow-type.js'

export async function getWorkflowInstances (workflow: Workflow, start = 0, stop = 100): Promise<WorkflowInstance[]> {
  return await WorkflowInstance.getInstancesOfWorkflow(workflow.id, start, stop)
}

export async function getHeadActionOfWorkflow (workflow: Workflow): Promise<Action | null> {
  const { prisma } = diContainer.cradle
  return await prisma.action.findFirst({ where: { workflowId: workflow.id, isHead: true } })
}

export async function createInstanceWithWorkflow (
  workflow: Workflow,
  trigger?: WorkflowTrigger,
  payload?: unknown
): Promise<WorkflowInstance> {
  const headAction = await getHeadActionOfWorkflow(workflow)
  if (headAction === null) {
    throw new Error('ERR_ACTION_NOT_FOUND')
  }
  return await WorkflowInstance.create(headAction, trigger, payload)
}

export async function getLinkedActionsOfWorkflow (workflow: Workflow): Promise<Action[]> {
  const { prisma } = diContainer.cradle
  const actions = await prisma.action.findMany({ where: { workflowId: workflow.id } })
  let current = actions.find(action => action.isHead)
  if (current === undefined) {
    return []
  }

  const actionMap = keyBy(actions, 'id')
  const linkedActions = []
  const visited: Record<string, boolean> = {}
  while (current !== undefined) {
    if (visited[current.id]) {
      throw new Error('CIRCULAR_ACTION_FOUND')
    }
    linkedActions.push(current)
    visited[current.id] = true
    current = current.nextActionId !== null ? actionMap[current.nextActionId] : undefined
  }

  return linkedActions
}
