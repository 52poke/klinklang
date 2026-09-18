import {
  actionCatalogResponseSchema,
  addWorkflowState,
  connectWorkflowStates,
  createUniqueStateName,
  workflowBadRequestResponseSchema,
  workflowMutationResponseSchema,
  type ActionCatalogEntry,
  type StateMachineDefinition
} from '@mudkipme/klinklang-domain'
import { PanelLeft } from 'lucide-react'
import React, { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react'
import { useBlocker, useParams } from 'react-router'
import { Button } from '../../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../../components/ui/alert-dialog'
import { readJson } from '../../lib/api'
import { useUserStore } from '../../store/user'
import { useWorkflowDetailStore } from '../../store/workflows'
import { createDefaultParameters } from './editor/schema-form'
import { WorkflowCanvas } from './editor/WorkflowCanvas'
import { WorkflowInspector } from './editor/WorkflowInspector'

import { EditorToolbar } from './editor/EditorToolbar'
import { ActionPalette } from './editor/ActionPalette'
import { FieldValidityContext } from './editor/field-validity'
import { draftReducer, parseDefinition, validateDefinition } from './editor/draft'

const DefinitionEditor = React.lazy(async () => {
  const module = await import('./editor/DefinitionEditor')
  return { default: module.DefinitionEditor }
})

type EditorMode = 'visual' | 'json'

export const WorkflowEditor: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>()
  const currentUser = useUserStore(state => state.currentUser)
  const workflow = useWorkflowDetailStore(state => state.workflow)
  const loadedDefinition = useWorkflowDetailStore(state => state.definition)
  const loading = useWorkflowDetailStore(state => state.loading)
  const detailError = useWorkflowDetailStore(state => state.error)
  const fetchDetail = useWorkflowDetailStore(state => state.fetchDetail)
  const setWorkflowDetail = useWorkflowDetailStore(state => state.setWorkflow)
  const clearDetail = useWorkflowDetailStore(state => state.clear)
  const [actions, setActions] = useState<ActionCatalogEntry[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [mode, setMode] = useState<EditorMode>('visual')
  const [history, dispatch] = useReducer(draftReducer, { past: [], present: null, future: [] })
  const definition = history.present
  const [mobilePanel, setMobilePanel] = useState<'canvas' | 'palette' | 'inspector'>('canvas')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [baseDefinition, setBaseDefinition] = useState<StateMachineDefinition | null>(null)
  const [definitionText, setDefinitionText] = useState('')
  const [selectedStateName, setSelectedStateName] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [fieldIssues, setFieldIssues] = useState<Record<string, string>>({})
  const reportFieldIssue = useCallback((id: string, issue: string | null) => {
    if (issue !== null) setSaveSuccess(null)
    setFieldIssues(current => {
      if ((current[id] ?? null) === issue) return current
      return issue === null ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)) : { ...current, [id]: issue }
    })
  }, [])
  const [inspectorVersion, setInspectorVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const initializedKey = useRef<string | null>(null)

  useEffect(() => {
    if (workflowId === undefined) return
    void fetchDetail(workflowId)
    return () => { clearDetail() }
  }, [clearDetail, fetchDetail, workflowId])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/actions').then(async response => {
      if (!response.ok) throw new Error(`Failed to load action catalog (HTTP ${response.status}).`)
      return actionCatalogResponseSchema.parse(await readJson(response))
    }).then(data => {
      if (!cancelled) setActions(data.actions)
    }).catch((cause: unknown) => {
      if (!cancelled) setCatalogError(cause instanceof Error ? cause.message : 'Failed to load action catalog.')
    }).finally(() => {
      if (!cancelled) setCatalogLoading(false)
    })
    return () => { cancelled = true }
  }, [catalogAttempt])

  useEffect(() => {
    if (workflow === null || loadedDefinition === null) return
    const key = `${workflow.id}:${workflow.currentRevision}`
    if (initializedKey.current === key) return
    initializedKey.current = key
    const next = structuredClone(loadedDefinition)
    dispatch({ type: 'reset', definition: next })
    setBaseDefinition(structuredClone(next))
    setDefinitionText(JSON.stringify(next, null, 2))
    setSelectedStateName(next.StartAt)
  }, [loadedDefinition, workflow])

  const canEdit = useMemo(() => {
    if (currentUser === null || workflow === null) return false
    const isOwner = workflow.userId !== null && workflow.userId === currentUser.id
    return workflow.isPrivate ? isOwner : isOwner || currentUser.groups.includes('sysop')
  }, [currentUser, workflow])

  const isDirty = useMemo(() => {
    if (definition === null || baseDefinition === null) return false
    if (Object.keys(fieldIssues).length > 0) return true
    if (mode === 'json') {
      const parsed = parseDefinition(definitionText)
      return parsed.definition === null || JSON.stringify(parsed.definition) !== JSON.stringify(baseDefinition)
    }
    return JSON.stringify(definition) !== JSON.stringify(baseDefinition)
  }, [baseDefinition, definition, definitionText, mode, fieldIssues])

  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent): void => {
      if (!isDirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', preventUnload)
    return () => { window.removeEventListener('beforeunload', preventUnload) }
  }, [isDirty])

  const blocker = useBlocker(isDirty)
  const jsonDraft = useMemo(() => parseDefinition(definitionText), [definitionText])
  const candidate = mode === 'json' ? jsonDraft.definition : definition
  const localIssues = useMemo(() => [...(candidate === null ? jsonDraft.issues : validateDefinition(candidate, actions)), ...Object.values(fieldIssues)], [actions, candidate, jsonDraft.issues, fieldIssues])

  const selectState = (name: string | null): void => {
    if (Object.keys(fieldIssues).length > 0) { setSaveError('Fix the invalid field JSON before selecting another state.'); return }
    setSelectedStateName(name)
    if (name !== null) setMobilePanel('inspector')
  }

  const updateDefinition = useCallback((next: StateMachineDefinition) => {
    dispatch({ type: 'edit', definition: next })
    if (mode === 'visual') setDefinitionText(JSON.stringify(next, null, 2))
    setSaveError(null)
    setSaveSuccess(null)
  }, [mode])

  const switchMode = (nextMode: EditorMode): void => {
    if (nextMode === mode || definition === null) return
    if (Object.keys(fieldIssues).length > 0) { setSaveError('Fix the invalid field JSON before switching modes.'); return }
    if (nextMode === 'json') {
      setDefinitionText(JSON.stringify(definition, null, 2))
      setMode('json')
      return
    }
    const parsed = parseDefinition(definitionText)
    if (parsed.definition === null) { setSaveError(parsed.issues.join('\n')); return }
    dispatch({ type: 'edit', definition: parsed.definition })
    setSelectedStateName(Object.hasOwn(parsed.definition.States, selectedStateName ?? '') ? selectedStateName : parsed.definition.StartAt)
    setMode('visual')
    setSaveError(null)
  }

  const addAction = (action: ActionCatalogEntry): void => {
    if (definition === null) return
    const stateName = createUniqueStateName(definition, action.type)
    const next = addWorkflowState(definition, stateName, {
      Type: 'Task',
      Resource: action.type,
      Parameters: createDefaultParameters(action.inputSchema),
      End: true
    })
    updateDefinition(next)
    setSelectedStateName(stateName)
    setMobilePanel('inspector')
  }

  const addState = (type: 'Pass' | 'Succeed' | 'Fail' | 'Choice'): void => {
    if (definition === null) return
    const stateName = createUniqueStateName(definition, type)
    updateDefinition(addWorkflowState(definition, stateName, type === 'Choice'
      ? { Type: 'Choice', Choices: [{ Variable: '$.value', IsPresent: true, Next: definition.StartAt }] }
      : type === 'Pass' ? { Type: 'Pass', Parameters: {}, End: true }
        : type === 'Fail' ? { Type: 'Fail', Error: 'WORKFLOW_FAILED' } : { Type: 'Succeed' }))
    setSelectedStateName(stateName)
    setMobilePanel('inspector')
  }

  const save = async (): Promise<void> => {
    if (Object.keys(fieldIssues).length > 0) return
    if (!canEdit || saving || workflow === null || definition === null || workflowId === undefined) return
    setSaveError(null)
    setSaveSuccess(null)
    const parsed = mode === 'json' ? parseDefinition(definitionText) : { definition, issues: [] }
    if (parsed.definition === null) { setSaveError(parsed.issues.join('\n')); return }
    const candidate = parsed.definition
    const issues = validateDefinition(candidate, actions)
    if (issues.length > 0) {
      setSaveError(issues.join('\n'))
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/workflow/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: workflow.currentRevision,
          definition: candidate
        })
      })
      if (response.status === 409) {
        setSaveError('This workflow changed after you opened it. Your draft is preserved; reload before deciding how to merge it.')
        return
      }
      if (!response.ok) {
        const parsedError = workflowBadRequestResponseSchema.safeParse(await readJson(response).catch(() => null))
        setSaveError(parsedError.success
          ? parsedError.data.issues.join('\n')
          : `Failed to save workflow (HTTP ${response.status}).`)
        return
      }
      const data = workflowMutationResponseSchema.parse(await readJson(response))
      initializedKey.current = `${data.workflow.id}:${data.workflow.currentRevision}`
      setWorkflowDetail(data.workflow, candidate)
      dispatch({ type: 'edit', definition: candidate })
      setBaseDefinition(structuredClone(candidate))
      setDefinitionText(JSON.stringify(candidate, null, 2))
      setSaveSuccess(`Saved revision ${data.workflow.currentRevision}.`)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Failed to save workflow.')
    } finally {
      setSaving(false)
    }
  }

  const restoreHistory = (type: 'undo' | 'redo'): void => {
    dispatch({ type })
    setInspectorVersion(value => value + 1)
    setSaveSuccess(null)
    setSaveError(null)
  }

  const onEditorKey = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || !canEdit || saving) return
    if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (isDirty && localIssues.length === 0) void save()
      return
    }
    const target = event.target
    if (mode !== 'visual' || (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null))) return
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault()
      restoreHistory(event.shiftKey ? 'redo' : 'undo')
    }
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => { onEditorKey(event) }
    window.addEventListener('keydown', listener)
    return () => { window.removeEventListener('keydown', listener) }
  }, [])

  if (loading && definition === null) return <div className='text-sm text-muted-foreground'>Loading workflow editor…</div>
  if (detailError !== null && definition === null) {
    return (
    <section className='rounded-xl border bg-card p-6'>
      <h1 className='font-semibold'>Unable to open workflow</h1>
      <p role='alert' className='my-3 text-sm text-destructive'>{detailError}</p>
      <Button variant='outline' onClick={() => { if (workflowId !== undefined) void fetchDetail(workflowId) }}>Try again</Button>
    </section>
    )
  }
  if (workflow === null || definition === null) return <div className='text-sm text-muted-foreground'>Workflow not available.</div>

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <EditorToolbar
        name={workflow.name} workflowId={workflow.id} revision={workflow.currentRevision}
        stateCount={Object.keys(candidate?.States ?? definition.States).length}
        isDirty={isDirty} mode={mode} saving={saving} canEdit={canEdit}
        canUndo={history.past.length > 0} canRedo={history.future.length > 0} hasIssues={localIssues.length > 0}
        onModeChange={switchMode} onUndo={() => { restoreHistory('undo') }} onRedo={() => { restoreHistory('redo') }}
        onSave={() => { void save() }}
        onReset={() => {
          if (baseDefinition === null) return
          const reset = structuredClone(baseDefinition)
          dispatch({ type: 'reset', definition: reset })
          setInspectorVersion(value => value + 1)
          setDefinitionText(JSON.stringify(reset, null, 2))
          setSelectedStateName(reset.StartAt)
          setSaveError(null)
          setSaveSuccess(null)
        }}
      />

      {!canEdit && <div className='rounded-md border bg-muted p-3 text-sm text-muted-foreground'>You can inspect this workflow, but you do not have permission to edit it.</div>}
      {saveError !== null && <div role='alert' className='whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive'>{saveError}</div>}
      {saveSuccess !== null && <div role='status' className='rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'>{saveSuccess}</div>}

      {mode === 'json'
        ? (
          <div className='min-h-0 flex-1 overflow-hidden rounded-xl border bg-card'>
            <React.Suspense fallback={<p className='p-6 text-sm text-muted-foreground'>Loading JSON editor…</p>}>
              <DefinitionEditor value={definitionText} onChange={(value) => { setDefinitionText(value); setSaveError(null); setSaveSuccess(null) }} readOnly={!canEdit || saving} />
            </React.Suspense>
          </div>
          )
        : (
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm'>
            <div className='flex gap-1 border-b p-2 lg:hidden' role='group' aria-label='Editor panels'>
              {(['palette', 'canvas', 'inspector'] as const).map(panel => <Button key={panel} size='sm' variant={mobilePanel === panel ? 'secondary' : 'ghost'} aria-pressed={mobilePanel === panel} onClick={() => { setMobilePanel(panel) }}>{panel === 'palette' ? <><PanelLeft className='size-4' />Add states</> : panel === 'canvas' ? 'Canvas' : 'Inspector'}</Button>)}
            </div>
            <div className='grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)_300px] 2xl:grid-cols-[250px_minmax(0,1fr)_340px]'>
              <div className={`${mobilePanel === 'palette' ? 'block' : 'hidden'} min-h-0 overflow-hidden lg:block lg:border-r`}>

                <ActionPalette
                  actions={actions}
                  loading={catalogLoading}
                  error={catalogError}
                  onRetry={() => { setCatalogLoading(true); setCatalogError(null); setCatalogAttempt(attempt => attempt + 1) }}
                  disabled={!canEdit || saving || Object.keys(fieldIssues).length > 0}
                  onAddAction={addAction}
                  onAddState={addState}
                />
              </div>
              <div className={`${mobilePanel === 'canvas' ? 'block' : 'hidden'} min-h-0 min-w-0 lg:block`}>
                <WorkflowCanvas
                  definition={definition}
                  selectedStateName={selectedStateName}
                  onSelectState={selectState}
                  readOnly={!canEdit || saving || Object.keys(fieldIssues).length > 0}
                  onConnect={(source, target, sourceHandle) => {
                    try {
                      updateDefinition(connectWorkflowStates(definition, source, target, sourceHandle))
                      setSelectedStateName(source)
                    } catch (cause) {
                      setSaveError(cause instanceof Error ? cause.message : 'Unable to connect states.')
                    }
                  }}
                />
              </div>
              <div className={`${mobilePanel === 'inspector' ? 'block' : 'hidden'} min-h-0 overflow-y-auto lg:block lg:border-l`}>
                <FieldValidityContext value={reportFieldIssue}>
                  <WorkflowInspector
                    key={`${inspectorVersion}:${selectedStateName ?? 'none'}:${selectedStateName !== null && Object.hasOwn(definition.States, selectedStateName) ? definition.States[selectedStateName].Type : ''}`}
                    definition={definition}
                    stateName={selectedStateName}
                    actions={actions}
                    hasInvalidFields={Object.keys(fieldIssues).length > 0}
                    onChange={updateDefinition}
                    onSelectState={selectState}
                    onOpenJson={() => { switchMode('json') }}
                    onError={setSaveError}
                    readOnly={!canEdit || saving}
                  />
                </FieldValidityContext>
              </div>
            </div>
          </div>
          )}

      {localIssues.length > 0 && (
        <details className='max-h-40 shrink-0 overflow-auto rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3' open>
          <summary className='cursor-pointer text-sm font-medium'>{localIssues.length} {localIssues.length === 1 ? 'issue' : 'issues'} to resolve before saving</summary>
          <ul className='mt-2 space-y-1 text-xs text-destructive'>
            {localIssues.map(issue => <li key={issue}>• {issue}</li>)}
          </ul>
        </details>
      )}
      <AlertDialog open={blocker.state === 'blocked'} onOpenChange={(open) => { if (!open && blocker.state === 'blocked') blocker.reset() }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle><AlertDialogDescription>Your draft has not been saved. Stay here to save a revision, or discard it and leave.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { if (blocker.state === 'blocked') blocker.proceed() }}>Discard and leave</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
