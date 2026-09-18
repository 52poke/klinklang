import {
  addWorkflowState,
  createUniqueStateName,
  renameWorkflowState,
  removeWorkflowState,
  updateWorkflowState,
  type ActionCatalogEntry,
  type PassState,
  type StateDefinition,
  type StateMachineDefinition,
  type TaskState
} from '@mudkipme/klinklang-domain'
import { Copy, MousePointer2 } from 'lucide-react'
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
import { ChoiceEditor } from './ChoiceEditor'
import { createDefaultParameters } from './schema-form'

interface WorkflowInspectorProps {
  definition: StateMachineDefinition
  stateName: string | null
  actions: ActionCatalogEntry[]
  onChange: (definition: StateMachineDefinition) => void
  onSelectState: (stateName: string | null) => void
  onOpenJson: () => void
  onError: (message: string | null) => void
  hasInvalidFields?: boolean
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
    <Label htmlFor='next-state'>Next state</Label>
    <select
      id='next-state'
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
      <option value='' disabled>Select a state</option>
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
  hasInvalidFields = false,
  readOnly = false
}) => {
  const state = stateName === null ? undefined : definition.States[stateName]
  const [nameDraft, setNameDraft] = useState(stateName ?? '')
  const action = useMemo(() => state?.Type === 'Task'
    ? actions.find(candidate => candidate.type === state.Resource)
    : undefined, [actions, state])

  if (stateName === null || state === undefined) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 bg-card p-6 text-center text-sm text-muted-foreground'>
        <MousePointer2 className='size-8 text-primary/60' />
        <h2 className='font-semibold text-foreground'>State inspector</h2>
        Select a state on the canvas to edit its configuration and connections.
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
    <div className='space-y-5 bg-card p-4'>
      <div>
        <div className='text-sm font-semibold'>State inspector</div>
        <div className='mt-1 text-xs text-muted-foreground'>{state.Type}{definition.StartAt === stateName ? ' · Start state' : ''}</div>
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor='state-name'>State name</Label>
        <div className='flex gap-2'>
          <Input id='state-name' onKeyDown={(event) => { if (!hasInvalidFields && event.key === 'Enter' && nameDraft.trim() !== stateName) rename() }} value={nameDraft} disabled={readOnly} onChange={(event) => { setNameDraft(event.target.value) }} />
          <Button type='button' size='sm' variant='outline' disabled={readOnly || hasInvalidFields || nameDraft.trim() === stateName} onClick={rename}>
            Rename
          </Button>
        </div>
      </div>

      {state.Type === 'Task' && (
        <>
          <div className='space-y-1.5'>
            <Label htmlFor='state-action'>Action</Label>
            <select
              id='state-action'
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
          <details className='space-y-3 rounded-md border p-3'>
            <summary className='cursor-pointer text-xs font-medium'>Input and output paths</summary>
            {optionalPathKeys.map(key => (
              <div className='space-y-1' key={key}>
                <Label htmlFor={`state-${key}`}>{key}</Label>
                <Input
                  id={`state-${key}`}
                  className='font-mono text-xs'
                  placeholder={key === 'ResultPath' ? '$.payload' : '$'}
                  value={state[key] ?? ''}
                  disabled={readOnly}
                  onChange={(event) => { commitState(updateOptionalPath(state, key, event.target.value)) }}
                />
              </div>
            ))}
          </details>
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
            <Label htmlFor='state-error'>Error</Label>
            <Input
              id='state-error'
              value={state.Error ?? ''}
              disabled={readOnly}
              onChange={(event) => { commitState({ ...state, Error: event.target.value.length > 0 ? event.target.value : undefined }) }}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='state-cause'>Cause</Label>
            <Textarea
              id='state-cause'
              value={state.Cause ?? ''}
              disabled={readOnly}
              onChange={(event) => { commitState({ ...state, Cause: event.target.value.length > 0 ? event.target.value : undefined }) }}
            />
          </div>
        </>
      )}

      {state.Type === 'Choice' && (
        <ChoiceEditor state={state} definition={definition} onChange={commitState} onOpenJson={onOpenJson} disabled={readOnly} />
      )}

      {state.Type === 'Succeed' && <p className='rounded-lg border bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800'>The workflow completes successfully when it reaches this state. No further configuration is needed.</p>}
      <div className='flex flex-wrap gap-2 border-t pt-4'>
        <Button type='button' size='sm' variant='outline' disabled={readOnly || hasInvalidFields} onClick={() => {
          const name = createUniqueStateName(definition, `${stateName}_copy`)
          onChange(addWorkflowState(definition, name, state))
          onSelectState(name)
        }}><Copy className='size-3.5' />Duplicate</Button>
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
              disabled={readOnly || hasInvalidFields || Object.keys(definition.States).length === 1}
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
