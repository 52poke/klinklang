import type { WorkflowInstance, WorkflowStepExecution } from '@mudkipme/klinklang-domain'
import React, { useCallback, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import { useUserStore } from '../../store/user'
import { useWorkflowInstancesStore } from '../../store/workflows'

const formatTime = (value?: number): string => {
  if (value === undefined) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

const formatDuration = (value?: number): string => {
  if (value === undefined) return '—'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(2)} s`
}

const formatJson = (value: unknown): string => {
  if (value === undefined) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return `Unable to display value: ${error instanceof Error ? error.message : 'serialization failed'}`
  }
}

const statusStyles: Record<WorkflowInstance['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200'
}

const stepStatusStyles: Record<WorkflowStepExecution['status'], string> = {
  queued: 'text-amber-700',
  running: 'text-blue-700',
  failed: 'text-rose-700',
  completed: 'text-emerald-700',
  cancelled: 'text-slate-600'
}

const StepInspection: React.FC<{ step: WorkflowStepExecution; index: number }> = ({ step, index }) => (
  <details className='rounded-lg border bg-muted/20' open={step.status === 'failed'}>
    <summary className='cursor-pointer list-none px-4 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <span className='font-medium'>{index + 1}. {step.stateName}</span>
          <span className='ml-2 text-xs text-muted-foreground'>{step.actionType}</span>
        </div>
        <div className='flex items-center gap-3 text-xs'>
          <span>{formatDuration(step.durationMs)}</span>
          <span className={`font-semibold uppercase ${stepStatusStyles[step.status]}`}>{step.status}</span>
        </div>
      </div>
    </summary>
    <div className='space-y-4 border-t px-4 py-4 text-xs'>
      <div className='grid gap-2 text-muted-foreground sm:grid-cols-2 lg:grid-cols-4'>
        <div><span className='font-medium text-foreground'>Attempts:</span> {step.attempts}</div>
        <div><span className='font-medium text-foreground'>Queued:</span> {formatTime(step.queuedAt)}</div>
        <div><span className='font-medium text-foreground'>Started:</span> {formatTime(step.startedAt)}</div>
        <div><span className='font-medium text-foreground'>Finished:</span> {formatTime(step.completedAt)}</div>
      </div>
      {step.retryOfJobId !== undefined && (
        <div className='text-muted-foreground'>Retry of job <span className='font-mono'>{step.retryOfJobId}</span></div>
      )}
      {step.failureReason !== undefined && (
        <div className='rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700'>{step.failureReason}</div>
      )}
      <div className='grid gap-4 lg:grid-cols-2'>
        <div>
          <div className='mb-1 font-medium'>Input</div>
          <pre className='max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] text-slate-100'>{formatJson(step.input)}</pre>
        </div>
        <div>
          <div className='mb-1 font-medium'>Output</div>
          <pre className='max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] text-slate-100'>{formatJson(step.output)}</pre>
        </div>
      </div>
      <div>
        <div className='mb-1 font-medium'>Logs</div>
        <div className='max-h-52 space-y-1 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px]'>
          {step.logs.length === 0
            ? <div className='text-muted-foreground'>No logs.</div>
            : step.logs.map((log, logIndex) => (
                <div key={`${log.timestamp}-${logIndex}`} className={log.level === 'error' ? 'text-rose-700' : 'text-muted-foreground'}>
                  {formatTime(log.timestamp)} [{log.level.toUpperCase()}] {log.message}
                </div>
              ))}
        </div>
      </div>
    </div>
  </details>
)

export const WorkflowInstances: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>()
  const { currentUser } = useUserStore()
  const instances = useWorkflowInstancesStore((state) => state.instances)
  const loading = useWorkflowInstancesStore((state) => state.loading)
  const mutating = useWorkflowInstancesStore((state) => state.mutating)
  const lastUpdatedAt = useWorkflowInstancesStore((state) => state.lastUpdatedAt)
  const error = useWorkflowInstancesStore((state) => state.error)
  const fetchInstancesFromStore = useWorkflowInstancesStore((state) => state.fetchInstances)
  const retryInstance = useWorkflowInstancesStore((state) => state.retryInstance)
  const cancelInstance = useWorkflowInstancesStore((state) => state.cancelInstance)
  const setInstancesError = useWorkflowInstancesStore((state) => state.setError)
  const clearInstances = useWorkflowInstancesStore((state) => state.clear)
  const canView = useMemo(() => currentUser !== null, [currentUser])

  const fetchInstances = useCallback(async () => {
    if (workflowId === undefined) {
      clearInstances()
      setInstancesError('Missing workflow id.')
      return
    }
    await fetchInstancesFromStore(workflowId)
  }, [clearInstances, fetchInstancesFromStore, setInstancesError, workflowId])

  useEffect(() => {
    void fetchInstances()
    const timer = workflowId === undefined
      ? undefined
      : window.setInterval(() => {
          if (document.visibilityState === 'visible') void fetchInstancesFromStore(workflowId, true)
        }, 3000)
    return () => {
      if (timer !== undefined) window.clearInterval(timer)
      clearInstances()
    }
  }, [clearInstances, fetchInstances, fetchInstancesFromStore, workflowId])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Workflow executions</h2>
          <p className='text-sm text-muted-foreground'>Step inputs, outputs, failures, timing, logs, and controls.</p>
          <div className='mt-1 flex items-center gap-2 text-xs text-muted-foreground'>
            <span className='h-2 w-2 animate-pulse rounded-full bg-emerald-500' />
            Live refresh every 3 seconds · Last update {formatTime(lastUpdatedAt ?? undefined)}
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Button asChild variant='outline'><Link to={`/pages/workflows/${workflowId ?? ''}`}>Back</Link></Button>
          <Button variant='outline' onClick={() => { void fetchInstances() }} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh now'}
          </Button>
        </div>
      </div>

      {!canView && <Card><CardContent className='py-4 text-sm text-muted-foreground'>Log in to inspect executions.</CardContent></Card>}
      {error !== null && <Card><CardContent className='py-4 text-sm text-destructive'>{error}</CardContent></Card>}
      {instances.length === 0 && error === null && !loading && canView && (
        <Card><CardContent className='py-6 text-sm text-muted-foreground'>No workflow executions found.</CardContent></Card>
      )}

      <div className='grid gap-4'>
        {instances.map((instance) => {
          const operation = mutating[instance.instanceId]
          return (
            <Card key={instance.instanceId}>
              <CardHeader className='flex flex-row items-start justify-between gap-4'>
                <div className='min-w-0 space-y-1'>
                  <CardTitle className='break-all text-base'>Instance {instance.instanceId}</CardTitle>
                  <div className='text-xs text-muted-foreground'>Current state: {instance.currentStateName ?? '—'}</div>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${statusStyles[instance.status]}`}>
                  {instance.status}
                </span>
              </CardHeader>
              <CardContent className='space-y-4 text-sm'>
                {instance.failureReason !== undefined && (
                  <div className='rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'>{instance.failureReason}</div>
                )}
                <div className='flex flex-wrap gap-2'>
                  {instance.status === 'failed' && (
                    <Button size='sm' onClick={() => { if (workflowId !== undefined) void retryInstance(workflowId, instance.instanceId) }} disabled={operation !== undefined}>
                      {operation === 'retry' ? 'Retrying...' : 'Retry failed step'}
                    </Button>
                  )}
                  {(instance.status === 'pending' || instance.status === 'running') && (
                    <Button variant='destructive' size='sm' onClick={() => { if (workflowId !== undefined) void cancelInstance(workflowId, instance.instanceId) }} disabled={operation !== undefined}>
                      {operation === 'cancel' ? 'Cancelling...' : 'Cancel execution'}
                    </Button>
                  )}
                </div>
                <Separator />
                <div className='grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4'>
                  <div><span className='font-medium text-foreground'>Created:</span> {formatTime(instance.createdAt)}</div>
                  <div><span className='font-medium text-foreground'>Started:</span> {formatTime(instance.startedAt)}</div>
                  <div><span className='font-medium text-foreground'>Completed:</span> {formatTime(instance.completedAt)}</div>
                  <div><span className='font-medium text-foreground'>Current job:</span> <span className='break-all font-mono'>{instance.currentJobId ?? '—'}</span></div>
                </div>
                <div className='space-y-2'>
                  <div className='font-medium'>Steps ({instance.steps.length})</div>
                  {instance.steps.length === 0
                    ? <div className='rounded-md border p-3 text-xs text-muted-foreground'>This execution has no task steps.</div>
                    : instance.steps.map((step, index) => <StepInspection key={step.jobId} step={step} index={index} />)}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
