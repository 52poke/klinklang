import Editor from '@monaco-editor/react'
import React, { useCallback, useMemo, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import type { StateMachineDefinition } from './definition'
import type { WorkflowMetaData } from './WorkflowMeta'
import { TriggerEditor, buildTriggerPayloads, buildTriggerDrafts } from './WorkflowTriggerEditor'

interface WorkflowFormState {
  name: string
  isPrivate: boolean
  enabled: boolean
}

interface WorkflowEditPanelProps {
  workflowId: string
  workflow: WorkflowMetaData
  definition: StateMachineDefinition
  onUpdated: (workflow: WorkflowMetaData, definition: StateMachineDefinition) => void
}

export const WorkflowEditPanel: React.FC<WorkflowEditPanelProps> = ({
  workflowId,
  workflow,
  definition,
  onUpdated
}) => {
  const initialForm = useMemo<WorkflowFormState>(() => ({
    name: workflow.name,
    isPrivate: workflow.isPrivate,
    enabled: workflow.enabled
  }), [workflow.enabled, workflow.isPrivate, workflow.name])

  const initialDefinitionText = useMemo(() => JSON.stringify(definition, null, 2), [definition])
  const initialTriggers = useMemo(() => buildTriggerDrafts(workflow.triggers), [workflow.triggers])

  const [formState, setFormState] = useState<WorkflowFormState>(initialForm)
  const [definitionText, setDefinitionText] = useState(initialDefinitionText)
  const [triggerDrafts, setTriggerDrafts] = useState(initialTriggers)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const parseDefinition = useCallback((): StateMachineDefinition | null => {
    try {
      return JSON.parse(definitionText) as StateMachineDefinition
    } catch (error) {
      setSaveError(`Definition JSON is invalid: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }, [definitionText])

  const isDirty = useMemo(() => {
    if (formState.name !== initialForm.name) {
      return true
    }
    if (formState.isPrivate !== initialForm.isPrivate) {
      return true
    }
    if (formState.enabled !== initialForm.enabled) {
      return true
    }
    if (definitionText.trim() !== initialDefinitionText.trim()) {
      return true
    }
    if (JSON.stringify(triggerDrafts) !== JSON.stringify(initialTriggers)) {
      return true
    }
    return false
  }, [definitionText, formState, initialDefinitionText, initialForm, initialTriggers, triggerDrafts])

  const resetForm = useCallback(() => {
    setFormState(initialForm)
    setDefinitionText(initialDefinitionText)
    setTriggerDrafts(initialTriggers)
    setSaveError(null)
    setSaveSuccess(null)
  }, [initialDefinitionText, initialForm, initialTriggers])

  const saveChanges = useCallback(async () => {
    setSaveError(null)
    setSaveSuccess(null)

    const definitionPayload = parseDefinition()
    if (definitionPayload === null) {
      return
    }

    const triggerResult = buildTriggerPayloads(triggerDrafts)
    if (triggerResult.error !== undefined) {
      setSaveError(triggerResult.error)
      return
    }

    const payload: Record<string, unknown> = {}
    if (formState.name !== initialForm.name) {
      payload.name = formState.name
    }
    if (formState.isPrivate !== initialForm.isPrivate) {
      payload.isPrivate = formState.isPrivate
    }
    if (formState.enabled !== initialForm.enabled) {
      payload.enabled = formState.enabled
    }
    if (JSON.stringify(triggerDrafts) !== JSON.stringify(initialTriggers)) {
      payload.triggers = triggerResult.triggers
    }
    if (definitionText.trim() !== initialDefinitionText.trim()) {
      payload.definition = definitionPayload
    }

    if (Object.keys(payload).length === 0) {
      setSaveSuccess('No changes to save.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/workflow/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (response.status === 401) {
        setSaveError('Please log in to update workflow.')
        return
      }
      if (response.status === 403) {
        setSaveError('You do not have permission to update this workflow.')
        return
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as { issues?: string[] | string; error?: string } | null
        if (errorData?.issues !== undefined) {
          setSaveError(Array.isArray(errorData.issues) ? errorData.issues.join('\n') : errorData.issues)
          return
        }
        setSaveError(errorData?.error ?? `Failed to update workflow (HTTP ${response.status}).`)
        return
      }
      const data = await response.json() as { workflow: WorkflowMetaData }
      onUpdated(data.workflow, definitionPayload)
      setSaveSuccess('Workflow updated.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update workflow.')
    } finally {
      setSaving(false)
    }
  }, [
    definitionText,
    formState,
    initialDefinitionText,
    initialForm,
    initialTriggers,
    onUpdated,
    parseDefinition,
    triggerDrafts,
    workflowId
  ])

  return (
    <div className='space-y-4 text-xs text-muted-foreground'>
      <div className='space-y-2'>
        <Label htmlFor='workflow-name'>Name</Label>
        <Input
          id='workflow-name'
          value={formState.name}
          onChange={(event) => {
            setFormState((prev) => ({ ...prev, name: event.target.value }))
          }}
        />
      </div>
      <div className='flex flex-col gap-3'>
        <label className='flex items-center gap-2 text-xs font-medium text-foreground' htmlFor='workflow-private'>
          <Checkbox
            id='workflow-private'
            checked={formState.isPrivate}
            onCheckedChange={(value) => {
              setFormState((prev) => ({ ...prev, isPrivate: Boolean(value) }))
            }}
          />
          Private workflow
        </label>
        <label className='flex items-center gap-2 text-xs font-medium text-foreground' htmlFor='workflow-enabled'>
          <Checkbox
            id='workflow-enabled'
            checked={formState.enabled}
            onCheckedChange={(value) => {
              setFormState((prev) => ({ ...prev, enabled: Boolean(value) }))
            }}
          />
          Enabled
        </label>
      </div>

      <TriggerEditor triggers={triggerDrafts} onChange={setTriggerDrafts} />

      <div className='space-y-2'>
        <Label>Definition (JSON)</Label>
        <div className='overflow-hidden rounded-md border'>
          <Editor
            height='320px'
            language='json'
            theme='vs'
            value={definitionText}
            onChange={(value) => {
              setDefinitionText(value ?? '')
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              scrollBeyondLastLine: false
            }}
          />
        </div>
      </div>

      {saveError !== null && <div className='text-xs text-destructive whitespace-pre-line'>{saveError}</div>}
      {saveSuccess !== null && <div className='text-xs text-emerald-600'>{saveSuccess}</div>}

      <div className='flex items-center gap-2'>
        <Button
          size='sm'
          onClick={() => {
            void saveChanges()
          }}
          disabled={saving || !isDirty}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
        <Button size='sm' variant='outline' onClick={resetForm} disabled={saving}>
          Reset
        </Button>
      </div>
    </div>
  )
}
