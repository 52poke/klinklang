import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

export type WorkflowTrigger =
  | {
    type: 'TRIGGER_EVENTBUS'
    topic: string
    predicate?: unknown
    throttle?: number
    throttleKeyPath?: string
  }
  | {
    type: 'TRIGGER_CRON'
    pattern: string
  }
  | {
    type: 'TRIGGER_MANUAL'
  }

export interface WorkflowMetaData {
  id: string
  name: string
  isPrivate: boolean
  enabled: boolean
  triggers: WorkflowTrigger[]
  createdAt: string
  updatedAt: string
  userId?: string | null
}

const formatDateTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

const getTriggerLabel = (trigger: WorkflowTrigger): string =>
  trigger.type.replace('TRIGGER_', '').replace(/_/guv, ' ')

const formatTriggerDetails = (trigger: WorkflowTrigger): Array<{ label: string; value: string }> => {
  switch (trigger.type) {
    case 'TRIGGER_EVENTBUS': {
      const details: Array<{ label: string; value: string }> = [
        { label: 'Topic', value: trigger.topic }
      ]
      if (trigger.throttle !== undefined) {
        details.push({ label: 'Throttle', value: `${trigger.throttle}s` })
      }
      if (trigger.throttleKeyPath !== undefined) {
        details.push({ label: 'Throttle key', value: trigger.throttleKeyPath })
      }
      if (trigger.predicate !== undefined) {
        details.push({ label: 'Predicate', value: JSON.stringify(trigger.predicate) })
      }
      return details
    }
    case 'TRIGGER_CRON':
      return [{ label: 'Pattern', value: trigger.pattern }]
    case 'TRIGGER_MANUAL':
      return [{ label: 'Mode', value: 'Manual trigger' }]
  }
}

export const WorkflowMeta: React.FC<{ workflow: WorkflowMetaData }> = ({ workflow }) => (
  <Card className='h-fit'>
    <CardHeader>
      <CardTitle className='text-sm'>Workflow metadata</CardTitle>
    </CardHeader>
    <CardContent className='space-y-4 text-xs text-muted-foreground'>
      <div>
        <div className='text-sm font-semibold text-foreground'>{workflow.name}</div>
        <div>{workflow.isPrivate ? 'Private' : 'Public'} • {workflow.enabled ? 'Enabled' : 'Disabled'}</div>
      </div>
      <div className='space-y-2'>
        <div><span className='font-medium text-foreground'>Id:</span> {workflow.id}</div>
        <div><span className='font-medium text-foreground'>Owner:</span> {workflow.userId ?? '-'}</div>
        <div><span className='font-medium text-foreground'>Created:</span> {formatDateTime(workflow.createdAt)}</div>
        <div><span className='font-medium text-foreground'>Updated:</span> {formatDateTime(workflow.updatedAt)}</div>
      </div>
      <div className='space-y-2'>
        <div className='font-medium text-foreground'>Triggers</div>
        {workflow.triggers.length === 0
          ? (
            <div>No triggers configured.</div>
          )
          : (
            <div className='flex flex-col gap-2'>
              {workflow.triggers.map((trigger, index) => (
                <div key={`trigger-${index}`} className='rounded-md border px-2 py-2'>
                  <div className='text-[11px] font-semibold uppercase tracking-wide text-foreground'>
                    {getTriggerLabel(trigger)}
                  </div>
                  <div className='mt-2 grid gap-1 text-[11px] text-muted-foreground'>
                    {formatTriggerDetails(trigger).map(detail => (
                      <div key={detail.label}>
                        <span className='font-medium text-foreground'>{detail.label}:</span>{' '}
                        <span className='break-all'>{detail.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </CardContent>
  </Card>
)
