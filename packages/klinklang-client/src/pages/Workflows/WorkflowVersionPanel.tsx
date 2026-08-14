import {
  workflowDeleteResponseSchema,
  workflowDiffResponseSchema,
  workflowMutationResponseSchema,
  workflowRevisionsResponseSchema,
  type WorkflowDiffChange,
  type WorkflowMetadata,
  type WorkflowRevisionMetadata
} from '@mudkipme/klinklang-domain'
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
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
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { readJson } from '../../lib/api'

interface WorkflowVersionPanelProps {
  workflow: WorkflowMetadata
  canManage: boolean
  canCreate: boolean
  onChanged: () => Promise<void>
}

const formatDateTime = (value: string): string => new Date(value).toLocaleString()

const formatValue = (value: unknown): string => {
  if (value === undefined) return '—'
  return JSON.stringify(value)
}

export const WorkflowVersionPanel: React.FC<WorkflowVersionPanelProps> = ({
  workflow,
  canManage,
  canCreate,
  onChanged
}) => {
  const navigate = useNavigate()
  const [revisions, setRevisions] = useState<WorkflowRevisionMetadata[]>([])
  const [fromRevision, setFromRevision] = useState<number>(workflow.currentRevision)
  const [toRevision, setToRevision] = useState<number>(workflow.currentRevision)
  const [changes, setChanges] = useState<WorkflowDiffChange[]>([])
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRevisions = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/workflow/${workflow.id}/revisions`)
      if (!response.ok) throw new Error(`Failed to load revisions (HTTP ${response.status}).`)
      const data = workflowRevisionsResponseSchema.parse(await readJson(response))
      setRevisions(data.revisions)
      setToRevision(workflow.currentRevision)
      setFromRevision(data.revisions.find(item => item.revision < workflow.currentRevision)?.revision
        ?? workflow.currentRevision)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load revisions.')
    } finally {
      setLoading(false)
    }
  }, [workflow.currentRevision, workflow.id])

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- the async loader synchronizes this panel with the selected workflow
    void loadRevisions()
  }, [loadRevisions])

  const compare = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({ from: String(fromRevision), to: String(toRevision) })
      const response = await fetch(`/api/workflow/${workflow.id}/revisions/diff?${query.toString()}`)
      if (!response.ok) throw new Error(`Failed to compare revisions (HTTP ${response.status}).`)
      const data = workflowDiffResponseSchema.parse(await readJson(response))
      setChanges(data.changes)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to compare revisions.')
    } finally {
      setLoading(false)
    }
  }, [fromRevision, toRevision, workflow.id])

  const rollback = useCallback(async () => {
    if (rollbackTarget === null) return
    setMutating(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/workflow/${workflow.id}/revisions/${rollbackTarget}/rollback`,
        { method: 'POST' }
      )
      if (!response.ok) throw new Error(`Failed to roll back workflow (HTTP ${response.status}).`)
      workflowMutationResponseSchema.parse(await readJson(response))
      setRollbackTarget(null)
      setChanges([])
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to roll back workflow.')
    } finally {
      setMutating(false)
    }
  }, [onChanged, rollbackTarget, workflow.id])

  const duplicate = useCallback(async () => {
    setMutating(true)
    setError(null)
    try {
      const response = await fetch(`/api/workflow/${workflow.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      })
      if (!response.ok) throw new Error(`Failed to duplicate workflow (HTTP ${response.status}).`)
      const data = workflowMutationResponseSchema.parse(await readJson(response))
      await navigate(`/pages/workflows/${data.workflow.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to duplicate workflow.')
    } finally {
      setMutating(false)
    }
  }, [navigate, workflow.id])

  const deleteWorkflow = useCallback(async () => {
    setMutating(true)
    setError(null)
    try {
      const response = await fetch(`/api/workflow/${workflow.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`Failed to delete workflow (HTTP ${response.status}).`)
      workflowDeleteResponseSchema.parse(await readJson(response))
      await navigate('/pages/workflows')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete workflow.')
      setDeleteOpen(false)
    } finally {
      setMutating(false)
    }
  }, [navigate, workflow.id])

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-3'>
        <div>
          <CardTitle className='text-sm'>Version history</CardTitle>
          <p className='mt-1 text-xs text-muted-foreground'>Immutable workflow snapshots and recovery tools.</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button asChild size='sm' variant='outline'>
            <a href={`/api/workflow/${workflow.id}/export`} download>Export</a>
          </Button>
          {canCreate && (
            <Button size='sm' variant='outline' disabled={mutating} onClick={() => { void duplicate() }}>
              Duplicate
            </Button>
          )}
          {canManage && (
            <Button size='sm' variant='destructive' disabled={mutating} onClick={() => { setDeleteOpen(true) }}>
              Delete
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {error !== null && <div className='text-xs text-destructive'>{error}</div>}
        <div className='grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] md:items-end'>
          <label className='space-y-1 text-xs text-muted-foreground'>
            <span>From</span>
            <select
              className='shad-input h-9 w-full rounded-md border border-input bg-background px-2 text-foreground'
              value={fromRevision}
              onChange={(event) => { setFromRevision(Number(event.target.value)) }}
            >
              {revisions.map(item => <option key={item.revision} value={item.revision}>Revision {item.revision}</option>)}
            </select>
          </label>
          <span className='hidden pb-2 text-xs text-muted-foreground md:block'>to</span>
          <label className='space-y-1 text-xs text-muted-foreground'>
            <span>To</span>
            <select
              className='shad-input h-9 w-full rounded-md border border-input bg-background px-2 text-foreground'
              value={toRevision}
              onChange={(event) => { setToRevision(Number(event.target.value)) }}
            >
              {revisions.map(item => <option key={item.revision} value={item.revision}>Revision {item.revision}</option>)}
            </select>
          </label>
          <Button size='sm' variant='outline' disabled={loading || revisions.length === 0} onClick={() => { void compare() }}>
            Compare
          </Button>
        </div>

        {changes.length > 0 && (
          <div className='max-h-72 space-y-2 overflow-auto rounded-md border p-3 text-xs'>
            {changes.map((change, index) => (
              <div key={`${change.path}:${index}`} className='grid gap-1 border-b pb-2 last:border-0'>
                <div><span className='font-semibold uppercase'>{change.kind}</span> {change.path.length === 0 ? '/' : change.path}</div>
                {change.kind !== 'added' && <div className='break-all text-muted-foreground'>Before: {formatValue(change.before)}</div>}
                {change.kind !== 'removed' && <div className='break-all text-muted-foreground'>After: {formatValue(change.after)}</div>}
              </div>
            ))}
          </div>
        )}
        {changes.length === 0 && !loading && (
          <div className='text-xs text-muted-foreground'>Select two revisions to inspect their differences.</div>
        )}

        <div className='space-y-2'>
          {revisions.map(item => (
            <div key={item.revision} className='flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs'>
              <div>
                <div className='font-medium text-foreground'>Revision {item.revision} · {item.changeKind}</div>
                <div className='text-muted-foreground'>
                  {formatDateTime(item.createdAt)}
                  {item.sourceWorkflowId === null ? '' : ` · from workflow ${item.sourceWorkflowId}`}
                  {item.sourceRevision === null ? '' : ` · from revision ${item.sourceRevision}`}
                </div>
              </div>
              {item.revision === workflow.currentRevision
                ? <span className='font-medium text-emerald-600'>Current</span>
                : canManage && (
                    <Button size='sm' variant='outline' disabled={mutating} onClick={() => { setRollbackTarget(item.revision) }}>
                      Roll back
                    </Button>
                  )}
            </div>
          ))}
        </div>
      </CardContent>

      <AlertDialog open={rollbackTarget !== null} onOpenChange={(open) => { if (!open) setRollbackTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Revision {rollbackTarget} will be restored as a new revision. Existing history remains immutable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={mutating} onClick={(event) => { event.preventDefault(); void rollback() }}>
              {mutating ? 'Rolling back…' : 'Roll back'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the workflow and all revisions. Workflows with active instances cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={mutating} onClick={(event) => { event.preventDefault(); void deleteWorkflow() }}>
              {mutating ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
