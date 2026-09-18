import type { WorkflowMetadata } from '@mudkipme/klinklang-domain'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Workflow, Pencil, RefreshCw } from 'lucide-react'
import { Input } from '../../components/ui/input'
import { Link } from 'react-router'
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
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import { useUserStore } from '../../store/user'
import { useWorkflowListStore } from '../../store/workflows'
import { WorkflowCreateDialog } from './WorkflowCreateDialog'
import { WorkflowImportControl } from './WorkflowImportControl'

const formatDateTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

export const Workflows: React.FC = () => {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const { currentUser } = useUserStore()
  const workflows = useWorkflowListStore((state) => state.workflows)
  const loading = useWorkflowListStore((state) => state.loading)
  const error = useWorkflowListStore((state) => state.error)
  const triggering = useWorkflowListStore((state) => state.triggering)
  const lastTriggerResult = useWorkflowListStore((state) => state.lastTriggerResult)
  const payloadDrafts = useWorkflowListStore((state) => state.payloadDrafts)
  const payloadErrors = useWorkflowListStore((state) => state.payloadErrors)
  const dialogOpen = useWorkflowListStore((state) => state.dialogOpen)
  const fetchWorkflows = useWorkflowListStore((state) => state.fetchWorkflows)
  const triggerWorkflow = useWorkflowListStore((state) => state.triggerWorkflow)
  const setDialogOpen = useWorkflowListStore((state) => state.setDialogOpen)
  const setPayloadDraft = useWorkflowListStore((state) => state.setPayloadDraft)
  const addWorkflow = useWorkflowListStore((state) => state.addWorkflow)

  const canTriggerManual = useMemo(() => {
    const groups = currentUser?.groups ?? []
    return groups.includes('sysop') || groups.includes('bot')
  }, [currentUser])
  const canCreate = useMemo(() => {
    const groups = currentUser?.groups ?? []
    return groups.includes('sysop') || groups.includes('bot')
  }, [currentUser])
  const hasManualTrigger = useCallback((workflow: WorkflowMetadata): boolean => (
    workflow.triggers.some(trigger => trigger.type === 'TRIGGER_MANUAL')
  ), [])

  const refreshWorkflows = useCallback(() => {
    void fetchWorkflows()
  }, [fetchWorkflows])

  useEffect(() => {
    void fetchWorkflows()
  }, [fetchWorkflows])

  const filtered = workflows.filter(workflow => workflow.name.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'all' || workflow.enabled === (status === 'enabled')))

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Workflows</h1>
          <p className='text-sm text-muted-foreground'>
            Build, manage, and run your wiki automations.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {canCreate && (
            <>
              <WorkflowImportControl onImported={addWorkflow} />
              <WorkflowCreateDialog
                userId={currentUser?.id ?? null}
                onCreated={(workflow) => {
                  addWorkflow(workflow)
                }}
              />
            </>
          )}
          <Button
            variant='outline'
            onClick={() => {
              refreshWorkflows()
            }}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3'>
        <div className='relative min-w-48 flex-1'><Search className='absolute left-3 top-2.5 size-4 text-muted-foreground' /><Input className='pl-9' aria-label='Search workflows' placeholder='Search workflows…' value={query} onChange={(event) => { setQuery(event.target.value) }} /></div>
        <select aria-label='Filter workflow status' className='h-9 rounded-md border bg-background px-3 text-sm' value={status} onChange={(event) => { setStatus(event.target.value) }}><option value='all'>All statuses</option><option value='enabled'>Enabled</option><option value='disabled'>Disabled</option></select>
        <span className='text-xs text-muted-foreground' role='status'>{filtered.length} {filtered.length === 1 ? 'workflow' : 'workflows'}</span>
      </div>
      {loading && workflows.length === 0 && <div role='status' className='space-y-3'>{[1, 2, 3].map(item => <div key={item} className='h-40 animate-pulse rounded-xl border bg-muted/60' />)}<span className='sr-only'>Loading workflows…</span></div>}
      {error !== null && (
        <Card>
          <CardContent className='py-4 text-sm text-destructive'>{error}</CardContent>
        </Card>
      )}

      {filtered.length === 0 && error === null && !loading && (
        <Card>
          <CardContent className='flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground'>
            <Workflow className='size-9 text-primary/50' />
            <p className='font-medium text-foreground'>{workflows.length === 0 ? 'Your automations start here' : 'No matching workflows'}</p>
            <p>{workflows.length === 0 ? 'Create a workflow or import an existing definition to get started.' : 'Try another name or change the status filter.'}</p>
            {workflows.length > 0 && <Button variant='outline' size='sm' onClick={() => { setQuery(''); setStatus('all') }}>Clear filters</Button>}
          </CardContent>
        </Card>
      )}

      <div className='grid gap-4'>
        {filtered.map((workflow) => (
          <Card key={workflow.id}>
            <CardHeader className='flex flex-row items-start justify-between gap-4'>
              <div className='space-y-1'>
                <CardTitle className='text-base'><Link className='hover:text-primary hover:underline' to={`/pages/workflows/${workflow.id}`}>{workflow.name}</Link></CardTitle>
                <div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
                  <span>{workflow.isPrivate ? 'Private' : 'Public'}</span>
                  <span>•</span>
                  <span className={workflow.enabled ? 'font-medium text-emerald-700' : ''}>{workflow.enabled ? 'Enabled' : 'Disabled'}</span>
                  <span>•</span>
                  <span>{workflow.triggers.length} triggers</span>
                  <span>•</span>
                  <span>Revision {workflow.currentRevision}</span>
                </div>
              </div>
              <div className='flex shrink-0 flex-col gap-2'>
                <Button asChild variant='outline'><Link to={`/pages/workflows/${workflow.id}/edit`}><Pencil className='size-3.5' />Open editor</Link></Button>
                <Button asChild variant='outline'>
                  <Link to={`/pages/workflows/${workflow.id}`}>View</Link>
                </Button>
                {hasManualTrigger(workflow) && (
                    <AlertDialog
                      open={dialogOpen[workflow.id] ?? false}
                      onOpenChange={(open) => {
                        setDialogOpen(workflow.id, open)
                      }}
                    >
                    <AlertDialogTrigger asChild>
                      <Button disabled={!canTriggerManual || triggering[workflow.id]}>
                        {triggering[workflow.id] ? 'Triggering…' : 'Trigger'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Trigger workflow</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will start a new instance of &quot;{workflow.name}&quot;. Continue?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className='space-y-2'>
                        <label className='text-xs font-medium text-foreground' htmlFor={`payload-${workflow.id}`}>
                          Payload (JSON)
                        </label>
                        <textarea
                          id={`payload-${workflow.id}`}
                          rows={5}
                          className='shad-input shad-focus w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground'
                          placeholder='{"key":"value"}'
                          value={payloadDrafts[workflow.id] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value
                            setPayloadDraft(workflow.id, value)
                          }}
                        />
                        {(payloadErrors[workflow.id] ?? '') !== '' && (
                          <div className='text-xs text-destructive'>{payloadErrors[workflow.id]}</div>
                        )}
                      </div>
                      {(lastTriggerResult[workflow.id] ?? '') !== '' && <p role='status' className='text-sm text-destructive'>{lastTriggerResult[workflow.id]}</p>}
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={triggering[workflow.id]}
                          onClick={(event) => {
                            event.preventDefault()
                            const payloadText = payloadDrafts[workflow.id]
                            triggerWorkflow(workflow.id, payloadText)
                              .then((ok) => {
                                if (ok) {
                                  setDialogOpen(workflow.id, false)
                                }
                              })
                              .catch(() => undefined)
                          }}
                        >
                          {triggering[workflow.id] ? 'Starting…' : 'Trigger'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <Separator />
              <div className='flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground'>
                <div>
                  <span className='font-medium text-foreground'>Created:</span> {formatDateTime(workflow.createdAt)}
                </div>
                <div>
                  <span className='font-medium text-foreground'>Updated:</span> {formatDateTime(workflow.updatedAt)}
                </div>
                {workflow.userId !== null && (
                  <div>
                    <span className='font-medium text-foreground'>Owner:</span> {workflow.userId}
                  </div>
                )}
              </div>
              {lastTriggerResult[workflow.id] !== '' && (
                <div className='text-xs text-muted-foreground'>
                  {lastTriggerResult[workflow.id]}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
