import {
  renameWorkflowState,
  removeWorkflowState,
  updateWorkflowState,
  type ActionCatalogEntry,
  type PassState,
  type StateDefinition,
  type StateMachineDefinition,
  type TaskState
} from '@mudkipme/klinklang-domain'
import React, { useMemo, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '../../../components/ui/alert-dialog'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import { SchemaDrivenForm, JsonValueEditor } from './SchemaDrivenForm'
import { createDefaultParameters } from './schema-form'

interface WorkflowInspectorProps {
  definition: StateMachineDefinition
  stateName: string | null
  actions: ActionCatalogEntry[]
  onChange: (definition: StateMachineDefinition) => void
  onSelectState: (stateName: string | null) => void
  onOpenJson: () => void
  onError: (message: string | null) => void
  readOnly?: boolean
}

const optionalPathKeys = ['InputPath', 'ResultPath', 'OutputPath'] as const

const updateOptionalPath = <T extends TaskState | PassState>(state: T, key: typeof optionalPathKeys[number], value: string): T => (
  { ...state, [key]: value.length > 0 ? value : undefined }
)

interface TransitionEditorProps {
  state: TaskState | PassState
  stateName: string
  definition: StateMachineDefinition
  onChange: (state: TaskState | PassState) => void
  disabled?: boolean
}

const TransitionEditor: React.FC<TransitionEditorProps> = ({ state, stateName, definition, onChange, disabled }) => (
  <div className='space-y-1.5'>
    <Label>Next state</Label>
    <select
      className='h-9 w-full rounded-md border bg-background px-3 text-sm'
      value={state.End === true ? '__end__' : (state.Next ?? '')}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value === '__end__') {
          const next = { ...state, End: true }
          delete next.Next
          onChange(next)
        } else {
          const next = { ...state, Next: event.target.value }
          delete next.End
          onChange(next)
        }
      }}
    >
      <option value=''>Select a state</option>
      <option value='__end__'>End workflow</option>
      {Object.keys(definition.States).map(name => (
        <option value={name} key={name}>{name === stateName ? `${name} (self)` : name}</option>
      ))}
    </select>
  </div>
)

export const WorkflowInspector: React.FC<WorkflowInspectorProps> = ({
  definition,
  stateName,
  actions,
  onChange,
  onSelectState,
  onOpenJson,
  onError,
  readOnly = false
}) => {
  const state = stateName === null ? undefined : definition.States[stateName]
  const [nameDraft, setNameDraft] = useState(stateName ?? '')
  const action = useMemo(() => state?.Type === 'Task'
    ? actions.find(candidate => candidate.type === state.Resource)
    : undefined, [actions, state])

  if (stateName === null || state === undefined) {
    return (
      <div className='rounded-lg border bg-card p-4 text-sm text-muted-foreground'>
        Select a state to edit its configuration.
      </div>
    )
  }

  const commitState = (nextState: StateDefinition): void => {
    onChange(updateWorkflowState(definition, stateName, nextState))
  }
  const rename = (): void => {
    try {
      const renamed = renameWorkflowState(definition, stateName, nameDraft)
      onChange(renamed)
      onSelectState(nameDraft.trim())
      onError(null)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Unable to rename state.')
    }
  }

  return (
    <div className='space-y-5 rounded-lg border bg-card p-4'>
      <div>
        <div className='text-sm font-semibold'>State inspector</div>
        <div className='text-xs text-muted-foreground'>{state.Type}</div>
      </div>

      <div className='space-y-1.5'>
        <Label>State name</Label>
        <div className='flex gap-2'>
          <Input value={nameDraft} disabled={readOnly} onChange={(event) => { setNameDraft(event.target.value) }} />
          <Button type='button' size='sm' variant='outline' disabled={readOnly || nameDraft.trim() === stateName} onClick={rename}>
            Rename
          </Button>
        </div>
      </div>

      {state.Type === 'Task' && (
        <>
          <div className='space-y-1.5'>
            <Label>Action</Label>
            <select
              className='h-9 w-full rounded-md border bg-background px-3 text-sm'
              value={state.Resource}
              disabled={readOnly}
              onChange={(event) => {
                const nextAction = actions.find(candidate => candidate.type === event.target.value)
                if (nextAction === undefined) return
                commitState({
                  ...state,
                  Resource: nextAction.type,
                  Parameters: createDefaultParameters(nextAction.inputSchema)
                })
              }}
            >
              {!actions.some(candidate => candidate.type === state.Resource) && (
                <option value={state.Resource}>{state.Resource} (unavailable)</option>
              )}
              {actions.map(candidate => <option value={candidate.type} key={candidate.type}>{candidate.display.label}</option>)}
            </select>
            {action !== undefined && (
              <div className='text-xs text-muted-foreground'>{action.display.description}</div>
            )}
          </div>
          <div className='space-y-2'>
            <Label>Action input</Label>
            {action === undefined
              ? <JsonValueEditor value={state.Parameters ?? {}} onChange={(value) => { commitState({ ...state, Parameters: value }) }} disabled={readOnly} />
              : (
                <div className='space-y-3'>
                  <SchemaDrivenForm
                    schema={action.inputSchema}
                    value={state.Parameters ?? {}}
                    onChange={(value) => { commitState({ ...state, Parameters: value }) }}
                    disabled={readOnly}
                  />
                  <details className='rounded-md border p-3'>
                    <summary className='cursor-pointer text-xs font-medium'>Advanced JSON input</summary>
                    <div className='mt-3'>
                      <JsonValueEditor
                        value={state.Parameters ?? {}}
                        onChange={(value) => { commitState({ ...state, Parameters: value }) }}
                        disabled={readOnly}
                      />
                    </div>
                  </details>
                </div>
                )}
          </div>
        </>
      )}

      {state.Type === 'Pass' && (
        <div className='space-y-2'>
          <Label>Parameters</Label>
          <JsonValueEditor value={state.Parameters ?? {}} onChange={(value) => { commitState({ ...state, Parameters: value }) }} disabled={readOnly} />
        </div>
      )}

      {(state.Type === 'Task' || state.Type === 'Pass') && (
        <>
          <div className='space-y-3 rounded-md border p-3'>
            <div className='text-xs font-medium'>Input and output paths</div>
            {optionalPathKeys.map(key => (
              <div className='space-y-1' key={key}>
                <Label>{key}</Label>
                <Input
                  className='font-mono text-xs'
                  placeholder={key === 'ResultPath' ? '$.payload' : '$'}
                  value={state[key] ?? ''}
                  disabled={readOnly}
                  onChange={(event) => { commitState(updateOptionalPath(state, key, event.target.value)) }}
                />
              </div>
            ))}
          </div>
          <TransitionEditor
            state={state}
            stateName={stateName}
            definition={definition}
            onChange={commitState}
            disabled={readOnly}
          />
        </>
      )}

      {state.Type === 'Fail' && (
        <>
          <div className='space-y-1.5'>
            <Label>Error</Label>
            <Input
              value={state.Error ?? ''}
              disabled={readOnly}
              onChange={(event) => { commitState({ ...state, Error: event.target.value.length > 0 ? event.target.value : undefined }) }}
            />
          </div>
          <div className='space-y-1.5'>
            <Label>Cause</Label>
            <Textarea
              value={state.Cause ?? ''}
              disabled={readOnly}
              onChange={(event) => { commitState({ ...state, Cause: event.target.value.length > 0 ? event.target.value : undefined }) }}
            />
          </div>
        </>
      )}

      {state.Type === 'Choice' && (
        <div className='space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950'>
          <div className='font-medium'>Choice conditions are read-only in this milestone.</div>
          <div className='text-muted-foreground'>You can reconnect its existing rule and default handles on the canvas, or edit the conditions in JSON.</div>
          <Button type='button' size='sm' variant='outline' onClick={onOpenJson}>Edit JSON</Button>
        </div>
      )}

      <div className='flex flex-wrap gap-2 border-t pt-4'>
        {definition.StartAt !== stateName && (
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={readOnly}
            onClick={() => { onChange({ ...definition, StartAt: stateName }) }}
          >
            Set as start
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type='button'
              size='sm'
              variant='destructive'
              disabled={readOnly || Object.keys(definition.States).length === 1}
            >
              Delete state
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{stateName}”?</AlertDialogTitle>
              <AlertDialogDescription>Incoming transitions to this state will also be removed. This remains a draft until you save.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  try {
                    onChange(removeWorkflowState(definition, stateName))
                    onSelectState(null)
                  } catch (cause) {
                    onError(cause instanceof Error ? cause.message : 'Unable to delete state.')
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
