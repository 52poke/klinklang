import React from 'react'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../../components/ui/dialog'
import type { StateMachineDefinition } from './definition'
import type { WorkflowMetaData } from './WorkflowMeta'
import { WorkflowEditPanel } from './WorkflowEditPanel'

interface WorkflowEditDialogProps {
  workflowId: string
  workflow: WorkflowMetaData
  definition: StateMachineDefinition
  onUpdated: (workflow: WorkflowMetaData, definition: StateMachineDefinition) => void
}

export const WorkflowEditDialog: React.FC<WorkflowEditDialogProps> = ({
  workflowId,
  workflow,
  definition,
  onUpdated
}) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant='outline'>Edit</Button>
    </DialogTrigger>
    <DialogContent className='max-h-[85vh] overflow-y-auto'>
      <DialogHeader>
        <DialogTitle>Edit workflow</DialogTitle>
        <DialogDescription>Update metadata, triggers, and definition.</DialogDescription>
      </DialogHeader>
      <WorkflowEditPanel
        workflowId={workflowId}
        workflow={workflow}
        definition={definition}
        onUpdated={onUpdated}
      />
    </DialogContent>
  </Dialog>
)
