import React from 'react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'
import type { WorkflowTrigger } from './WorkflowMeta'

export type TriggerDraft =
  | {
    id: string
    type: 'TRIGGER_EVENTBUS'
    topic: string
    predicateText: string
    throttle: string
    throttleKeyPath: string
  }
  | {
    id: string
    type: 'TRIGGER_CRON'
    pattern: string
  }
  | {
    id: string
    type: 'TRIGGER_MANUAL'
  }

const TRIGGER_OPTIONS: Array<{ value: TriggerDraft['type']; label: string }> = [
  { value: 'TRIGGER_EVENTBUS', label: 'Eventbus' },
  { value: 'TRIGGER_CRON', label: 'Cron' },
  { value: 'TRIGGER_MANUAL', label: 'Manual' }
]

const createTriggerId = (): string => `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const buildTriggerDrafts = (triggers: WorkflowTrigger[]): TriggerDraft[] =>
  triggers.map((trigger) => {
    switch (trigger.type) {
      case 'TRIGGER_EVENTBUS':
        return {
          id: createTriggerId(),
          type: trigger.type,
          topic: trigger.topic,
          predicateText: trigger.predicate === undefined ? '' : JSON.stringify(trigger.predicate, null, 2),
          throttle: trigger.throttle === undefined ? '' : String(trigger.throttle),
          throttleKeyPath: trigger.throttleKeyPath ?? ''
        }
      case 'TRIGGER_CRON':
        return {
          id: createTriggerId(),
          type: trigger.type,
          pattern: trigger.pattern
        }
      case 'TRIGGER_MANUAL':
        return { id: createTriggerId(), type: trigger.type }
    }
    throw new Error(`Unexpected trigger type: ${String(trigger)}`)
  })

export const buildTriggerPayloads = (drafts: TriggerDraft[]): { triggers: WorkflowTrigger[]; error?: string } => {
  const triggers: WorkflowTrigger[] = []
  for (const draft of drafts) {
    if (draft.type === 'TRIGGER_MANUAL') {
      triggers.push({ type: draft.type })
      continue
    }
    if (draft.type === 'TRIGGER_CRON') {
      if (draft.pattern.trim().length === 0) {
        return { triggers: [], error: 'Cron trigger pattern is required.' }
      }
      triggers.push({ type: draft.type, pattern: draft.pattern.trim() })
      continue
    }
    if (draft.topic.trim().length === 0) {
      return { triggers: [], error: 'Eventbus trigger topic is required.' }
    }
    let predicate: unknown = undefined
    if (draft.predicateText.trim().length > 0) {
      try {
        predicate = JSON.parse(draft.predicateText)
      } catch (error) {
        return { triggers: [], error: `Invalid predicate JSON: ${error instanceof Error ? error.message : 'Unknown error'}` }
      }
    }
    const throttleText = draft.throttle.trim()
    const throttleValue = throttleText.length === 0 ? undefined : Number.parseInt(throttleText, 10)
    if (throttleText.length > 0 && Number.isNaN(throttleValue)) {
      return { triggers: [], error: 'Throttle must be a number.' }
    }
    triggers.push({
      type: draft.type,
      topic: draft.topic.trim(),
      predicate: draft.predicateText.trim().length > 0 ? predicate : undefined,
      throttle: throttleValue,
      throttleKeyPath: draft.throttleKeyPath.trim() === '' ? undefined : draft.throttleKeyPath.trim()
    })
  }
  return { triggers }
}

interface TriggerEditorProps {
  triggers: TriggerDraft[]
  onChange: (next: TriggerDraft[]) => void
}

export const TriggerEditor: React.FC<TriggerEditorProps> = ({ triggers, onChange }) => (
  <div className='space-y-3'>
    <div className='flex items-center justify-between'>
      <div className='text-xs font-medium text-foreground'>Triggers</div>
      <Button
        size='sm'
        variant='outline'
        onClick={() => {
          onChange([...triggers, { id: createTriggerId(), type: 'TRIGGER_MANUAL' }])
        }}
      >
        Add trigger
      </Button>
    </div>
    {triggers.length === 0 && (
      <div className='text-xs text-muted-foreground'>No triggers configured.</div>
    )}
    <div className='space-y-3'>
      {triggers.map((trigger, index) => (
        <div key={trigger.id} className='rounded-md border p-3'>
          <div className='flex items-center justify-between gap-2'>
            <div className='text-xs font-medium text-foreground'>Trigger {index + 1}</div>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => {
                onChange(triggers.filter((item) => item.id !== trigger.id))
              }}
            >
              Remove
            </Button>
          </div>
          <div className='mt-3 space-y-3'>
            <div className='space-y-2'>
              <Label>Type</Label>
              <Select
                value={trigger.type}
                onValueChange={(value) => {
                  onChange(triggers.map((item) => {
                    if (item.id !== trigger.id) {
                      return item
                    }
                    if (value === 'TRIGGER_EVENTBUS') {
                      return {
                        id: item.id,
                        type: 'TRIGGER_EVENTBUS',
                        topic: '',
                        predicateText: '',
                        throttle: '',
                        throttleKeyPath: ''
                      }
                    }
                    if (value === 'TRIGGER_CRON') {
                      return { id: item.id, type: 'TRIGGER_CRON', pattern: '' }
                    }
                    return { id: item.id, type: 'TRIGGER_MANUAL' }
                  }))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select trigger type' />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {trigger.type === 'TRIGGER_EVENTBUS' && (
              <>
                <div className='space-y-2'>
                  <Label>Topic</Label>
                  <Input
                    value={trigger.topic}
                    onChange={(event) => {
                      const value = event.target.value
                      onChange(triggers.map((item) => (
                        item.id === trigger.id ? { ...item, topic: value } : item
                      )))
                    }}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Predicate (JSON)</Label>
                  <Textarea
                    rows={4}
                    value={trigger.predicateText}
                    onChange={(event) => {
                      const value = event.target.value
                      onChange(triggers.map((item) => (
                        item.id === trigger.id ? { ...item, predicateText: value } : item
                      )))
                    }}
                  />
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label>Throttle (seconds)</Label>
                    <Input
                      value={trigger.throttle}
                      onChange={(event) => {
                        const value = event.target.value
                        onChange(triggers.map((item) => (
                          item.id === trigger.id ? { ...item, throttle: value } : item
                        )))
                      }}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>Throttle key path</Label>
                    <Input
                      value={trigger.throttleKeyPath}
                      onChange={(event) => {
                        const value = event.target.value
                        onChange(triggers.map((item) => (
                          item.id === trigger.id ? { ...item, throttleKeyPath: value } : item
                        )))
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {trigger.type === 'TRIGGER_CRON' && (
              <div className='space-y-2'>
                <Label>Pattern</Label>
                <Input
                  value={trigger.pattern}
                  onChange={(event) => {
                    const value = event.target.value
                    onChange(triggers.map((item) => (
                      item.id === trigger.id ? { ...item, pattern: value } : item
                    )))
                  }}
                />
              </div>
            )}

            {trigger.type === 'TRIGGER_MANUAL' && (
              <div className='text-xs text-muted-foreground'>Manual triggers do not require extra fields.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)
