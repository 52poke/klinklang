import {
  stateMachineDefinitionSchema,
  workflowMetadataSchema,
  workflowTriggersSchema,
  type StateMachineDefinition,
  type WorkflowMetadata,
  type WorkflowTrigger
} from '@mudkipme/klinklang-domain'
import type { Workflow } from '@mudkipme/klinklang-prisma'

export function parseWorkflowDefinition (workflow: Pick<Workflow, 'definition'>): StateMachineDefinition {
  return stateMachineDefinitionSchema.parse(workflow.definition)
}

export function parseWorkflowTriggers (workflow: Pick<Workflow, 'triggers'>): WorkflowTrigger[] {
  return workflowTriggersSchema.parse(workflow.triggers)
}

export function toWorkflowMetadata (workflow: Workflow): WorkflowMetadata {
  return workflowMetadataSchema.parse({
    id: workflow.id,
    name: workflow.name,
    isPrivate: workflow.isPrivate,
    enabled: workflow.enabled,
    triggers: workflow.triggers,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
    userId: workflow.userId
  })
}
