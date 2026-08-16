import Editor from '@monaco-editor/react'
import {
  actionCatalogResponseSchema,
  addWorkflowState,
  connectWorkflowStates,
  createUniqueStateName,
  stateMachineDefinitionSchema,
  validateWorkflowGraph,
  workflowBadRequestResponseSchema,
  workflowMutationResponseSchema,
  type ActionCatalogEntry,
  type StateDefinition,
  type StateMachineDefinition
} from '@mudkipme/klinklang-domain'
import { CircleX, GitBranch, Play, Search, Workflow } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '../../components/ui/button'
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
} from '../../components/ui/alert-dialog'
import { Input } from '../../components/ui/input'
import { readJson } from '../../lib/api'
import { useUserStore } from '../../store/user'
import { useWorkflowDetailStore } from '../../store/workflows'
import { createDefaultParameters, validateParameterTemplate } from './editor/schema-form'
import { WorkflowCanvas } from './editor/WorkflowCanvas'
import { WorkflowInspector } from './editor/WorkflowInspector'

type EditorMode = 'visual' | 'json'

const statePalette: Array<{
  type: Exclude<StateDefinition['Type'], 'Task' | 'Choice'>
  label: string
  description: string
  icon: React.ReactNode
}> = [
  { type: 'Pass', label: 'Pass', description: 'Transform or forward workflow context.', icon: <Play className='size-4' /> },
  { type: 'Succeed', label: 'Succeed', description: 'Complete the workflow successfully.', icon: <Workflow className='size-4' /> },
  { type: 'Fail', label: 'Fail', description: 'Stop with an error and cause.', icon: <CircleX className='size-4' /> }
]

const createFlowState = (type: 'Pass' | 'Succeed' | 'Fail'): StateDefinition => {
  if (type === 'Pass') return { Type: 'Pass', Parameters: {}, End: true }
  if (type === 'Fail') return { Type: 'Fail', Error: 'WORKFLOW_FAILED' }
  return { Type: 'Succeed' }
}

interface ActionPaletteProps {
  actions: ActionCatalogEntry[]
  loading: boolean
  disabled: boolean
  onAddAction: (action: ActionCatalogEntry) => void
  onAddState: (type: 'Pass' | 'Succeed' | 'Fail') => void
}

const ActionPalette: React.FC<ActionPaletteProps> = ({ actions, loading, disabled, onAddAction, onAddState }) => {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized.length === 0
      ? actions
      : actions.filter(action => (
        action.type.toLowerCase().includes(normalized) ||
        action.display.label.toLowerCase().includes(normalized) ||
        action.display.description.toLowerCase().includes(normalized)
      ))
  }, [actions, query])
  const categories = useMemo(() => Array.from(new Set(filtered.map(action => action.display.category))), [filtered])

  return (
    <aside className='h-full overflow-y-auto rounded-lg border bg-card p-3'>
      <div className='mb-3'>
        <div className='text-sm font-semibold'>Action palette</div>
        <div className='text-xs text-muted-foreground'>Add a state, then connect it on the canvas.</div>
      </div>
      <div className='relative mb-4'>
        <Search className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
        <Input className='pl-8' value={query} placeholder='Search actions' onChange={(event) => { setQuery(event.target.value) }} />
      </div>
      <div className='space-y-4'>
        <section className='space-y-2'>
          <div className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>Flow control</div>
          {statePalette.map(item => (
            <button
              type='button'
              className='flex w-full items-start gap-2 rounded-md border p-2 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-50'
              disabled={disabled}
              onClick={() => { onAddState(item.type) }}
              key={item.type}
            >
              <span className='mt-0.5'>{item.icon}</span>
              <span>
                <span className='block text-xs font-medium'>{item.label}</span>
                <span className='block text-[11px] text-muted-foreground'>{item.description}</span>
              </span>
            </button>
          ))}
          <div className='flex items-start gap-2 rounded-md border border-dashed p-2 opacity-60'>
            <GitBranch className='mt-0.5 size-4' />
            <div>
              <div className='text-xs font-medium'>Choice</div>
              <div className='text-[11px] text-muted-foreground'>Condition creation arrives in the next milestone.</div>
            </div>
          </div>
        </section>
        {loading && <div className='text-xs text-muted-foreground'>Loading action catalog…</div>}
        {categories.map(category => (
          <section className='space-y-2' key={category}>
            <div className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>{category}</div>
            {filtered.filter(action => action.display.category === category).map(action => (
              <button
                type='button'
                className='w-full rounded-md border p-2 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-50'
                disabled={disabled}
                onClick={() => { onAddAction(action) }}
                key={action.type}
              >
                <span className='block text-xs font-medium'>{action.display.label}</span>
                <span className='block text-[11px] text-muted-foreground'>{action.display.description}</span>
                <span className='mt-1 flex flex-wrap gap-1'>
                  <span className='rounded bg-muted px-1.5 py-0.5 text-[9px]'>{action.sideEffect}</span>
                  <span className='rounded bg-muted px-1.5 py-0.5 text-[9px]'>{action.idempotency}</span>
                  <span className='rounded bg-muted px-1.5 py-0.5 text-[9px]'>{action.retry.attempts} attempt{action.retry.attempts === 1 ? '' : 's'}</span>
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}

const formatSchemaIssues = (definition: StateMachineDefinition, actions: ActionCatalogEntry[]): string[] => {
  const issues = [...validateWorkflowGraph(definition)]
  if (actions.length === 0) return issues
  for (const [stateName, state] of Object.entries(definition.States)) {
    if (state.Type !== 'Task') continue
    const action = actions.find(candidate => candidate.type === state.Resource)
    if (action === undefined) {
      issues.push(`States.${stateName}.Resource: unsupported action ${state.Resource}`)
      continue
    }
    issues.push(...validateParameterTemplate(state.Parameters ?? {}, action.inputSchema)
      .map(issue => `States.${stateName}.${issue}`))
  }
  return Array.from(new Set(issues))
}

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
  const [definition, setDefinition] = useState<StateMachineDefinition | null>(null)
  const [baseDefinition, setBaseDefinition] = useState<StateMachineDefinition | null>(null)
  const [definitionText, setDefinitionText] = useState('')
  const [selectedStateName, setSelectedStateName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
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
      if (!cancelled) setSaveError(cause instanceof Error ? cause.message : 'Failed to load action catalog.')
    }).finally(() => {
      if (!cancelled) setCatalogLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (workflow === null || loadedDefinition === null) return
    const key = `${workflow.id}:${workflow.currentRevision}`
    if (initializedKey.current === key) return
    initializedKey.current = key
    const next = structuredClone(loadedDefinition)
    setDefinition(next)
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
    if (mode === 'json') return definitionText.trim() !== JSON.stringify(baseDefinition, null, 2).trim()
    return JSON.stringify(definition) !== JSON.stringify(baseDefinition)
  }, [baseDefinition, definition, definitionText, mode])

  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent): void => {
      if (!isDirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', preventUnload)
    return () => { window.removeEventListener('beforeunload', preventUnload) }
  }, [isDirty])

  const localIssues = useMemo(() => definition === null ? [] : formatSchemaIssues(definition, actions), [actions, definition])

  const updateDefinition = useCallback((next: StateMachineDefinition) => {
    setDefinition(next)
    if (mode === 'visual') setDefinitionText(JSON.stringify(next, null, 2))
    setSaveError(null)
    setSaveSuccess(null)
  }, [mode])

  const switchMode = (nextMode: EditorMode): void => {
    if (nextMode === mode || definition === null) return
    if (nextMode === 'json') {
      setDefinitionText(JSON.stringify(definition, null, 2))
      setMode('json')
      return
    }
    try {
      const input: unknown = JSON.parse(definitionText)
      const parsed = stateMachineDefinitionSchema.safeParse(input)
      if (!parsed.success) {
        setSaveError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n'))
        return
      }
      setDefinition(parsed.data)
      setSelectedStateName(Object.hasOwn(parsed.data.States, selectedStateName ?? '')
        ? selectedStateName
        : parsed.data.StartAt)
      setMode('visual')
      setSaveError(null)
    } catch (cause) {
      setSaveError(`Definition JSON is invalid: ${cause instanceof Error ? cause.message : 'Unknown error'}`)
    }
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
  }

  const addState = (type: 'Pass' | 'Succeed' | 'Fail'): void => {
    if (definition === null) return
    const stateName = createUniqueStateName(definition, type)
    updateDefinition(addWorkflowState(definition, stateName, createFlowState(type)))
    setSelectedStateName(stateName)
  }

  const save = async (): Promise<void> => {
    if (workflow === null || definition === null || workflowId === undefined) return
    setSaveError(null)
    setSaveSuccess(null)
    let candidate = definition
    if (mode === 'json') {
      try {
        const parsed = stateMachineDefinitionSchema.safeParse(JSON.parse(definitionText) as unknown)
        if (!parsed.success) {
          setSaveError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n'))
          return
        }
        candidate = parsed.data
      } catch (cause) {
        setSaveError(`Definition JSON is invalid: ${cause instanceof Error ? cause.message : 'Unknown error'}`)
        return
      }
    }
    const issues = formatSchemaIssues(candidate, actions)
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
      setDefinition(candidate)
      setBaseDefinition(structuredClone(candidate))
      setDefinitionText(JSON.stringify(candidate, null, 2))
      setSaveSuccess(`Saved revision ${data.workflow.currentRevision}.`)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Failed to save workflow.')
    } finally {
      setSaving(false)
    }
  }

  if (loading && definition === null) return <div className='text-sm text-muted-foreground'>Loading workflow editor…</div>
  if (detailError !== null && definition === null) return <div className='text-sm text-destructive'>{detailError}</div>
  if (workflow === null || definition === null) return <div className='text-sm text-muted-foreground'>Workflow not available.</div>

  return (
    <div className='relative left-1/2 w-[min(1800px,calc(100vw-2rem))] -translate-x-1/2 space-y-4'>
      <header className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <div className='flex items-center gap-2'>
            <h2 className='text-lg font-semibold'>{workflow.name}</h2>
            <span className='rounded-full border px-2 py-0.5 text-xs text-muted-foreground'>Revision {workflow.currentRevision}</span>
          </div>
          <p className='text-sm text-muted-foreground'>Visual workflow editor</p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button asChild variant='outline'><Link to={`/pages/workflows/${workflow.id}`}>Back</Link></Button>
          <div className='flex rounded-md border p-0.5'>
            <Button size='sm' variant={mode === 'visual' ? 'secondary' : 'ghost'} onClick={() => { switchMode('visual') }}>Visual</Button>
            <Button size='sm' variant={mode === 'json' ? 'secondary' : 'ghost'} onClick={() => { switchMode('json') }}>JSON</Button>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant='outline' disabled={!isDirty || saving}>Reset</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
                <AlertDialogDescription>All changes made since revision {workflow.currentRevision} will be lost.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep editing</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (baseDefinition === null) return
                    const reset = structuredClone(baseDefinition)
                    setDefinition(reset)
                    setDefinitionText(JSON.stringify(reset, null, 2))
                    setSelectedStateName(reset.StartAt)
                    setSaveError(null)
                    setSaveSuccess(null)
                  }}
                >
                  Discard changes
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button disabled={!canEdit || !isDirty || saving || localIssues.length > 0} onClick={() => { void save() }}>
            {saving ? 'Saving…' : 'Save revision'}
          </Button>
        </div>
      </header>

      {!canEdit && <div className='rounded-md border bg-muted p-3 text-sm text-muted-foreground'>You can inspect this workflow, but you do not have permission to edit it.</div>}
      {saveError !== null && <div className='whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive'>{saveError}</div>}
      {saveSuccess !== null && <div className='rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'>{saveSuccess}</div>}

      {mode === 'json'
        ? (
          <div className='overflow-hidden rounded-lg border'>
            <Editor
              height='70vh'
              language='json'
              theme='vs'
              value={definitionText}
              onChange={(value) => { setDefinitionText(value ?? ''); setSaveError(null); setSaveSuccess(null) }}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, readOnly: !canEdit }}
            />
          </div>
          )
        : (
          <div className='grid min-h-[660px] gap-3 xl:grid-cols-[250px_minmax(520px,1fr)_360px]'>
            <ActionPalette
              actions={actions}
              loading={catalogLoading}
              disabled={!canEdit}
              onAddAction={addAction}
              onAddState={addState}
            />
            <WorkflowCanvas
              definition={definition}
              selectedStateName={selectedStateName}
              onSelectState={setSelectedStateName}
              readOnly={!canEdit}
              onConnect={(source, target, sourceHandle) => {
                try {
                  updateDefinition(connectWorkflowStates(definition, source, target, sourceHandle))
                  setSelectedStateName(source)
                } catch (cause) {
                  setSaveError(cause instanceof Error ? cause.message : 'Unable to connect states.')
                }
              }}
            />
            <div className='h-full overflow-y-auto'>
              <WorkflowInspector
                key={selectedStateName ?? 'none'}
                definition={definition}
                stateName={selectedStateName}
                actions={actions}
                onChange={updateDefinition}
                onSelectState={setSelectedStateName}
                onOpenJson={() => { switchMode('json') }}
                onError={setSaveError}
                readOnly={!canEdit}
              />
            </div>
          </div>
          )}

      {mode === 'visual' && localIssues.length > 0 && (
        <section className='rounded-lg border bg-card p-4'>
          <div className='mb-2 text-sm font-semibold'>Draft validation</div>
          <ul className='space-y-1 text-xs text-destructive'>
            {localIssues.map(issue => <li key={issue}>• {issue}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
