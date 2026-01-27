import React, { useMemo, useState } from 'react'
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

interface WorkflowCreateDialogProps {
  userId?: string | null
  onCreated: (workflow: WorkflowMetaData) => void
}

const createDefaultDefinition = (): StateMachineDefinition => ({
  StartAt: 'Start',
  States: {
    Start: {
      Type: 'Succeed'
    }
  }
})

export const WorkflowCreateDialog: React.FC<WorkflowCreateDialogProps> = ({ userId, onCreated }) => {
  const [open, setOpen] = useState(false)
  const now = new Date().toISOString()
  const defaultWorkflow: WorkflowMetaData = useMemo(() => ({
    id: '',
    name: '',
    isPrivate: false,
    enabled: true,
    triggers: [],
    createdAt: now,
    updatedAt: now,
    userId: userId ?? null
  }), [now, userId])
  const defaultDefinition = useMemo(() => createDefaultDefinition(), [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'>Create workflow</Button>
      </DialogTrigger>
      <DialogContent className='max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Create workflow</DialogTitle>
          <DialogDescription>Define workflow metadata, triggers, and definition.</DialogDescription>
        </DialogHeader>
        <WorkflowEditPanel
          mode='create'
          workflow={defaultWorkflow}
          definition={defaultDefinition}
          onUpdated={(workflow) => {
            onCreated(workflow)
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
