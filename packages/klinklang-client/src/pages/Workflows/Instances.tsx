import React, { useCallback, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import { useUserStore } from '../../store/user'
import { useWorkflowInstancesStore, type WorkflowInstance } from '../../store/workflows'

const formatTime = (value?: number): string => {
  if (value === undefined) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleString()
}

const statusStyles: Record<WorkflowInstance['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

export const WorkflowInstances: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>()
  const { currentUser } = useUserStore()
  const instances = useWorkflowInstancesStore((state) => state.instances)
  const loading = useWorkflowInstancesStore((state) => state.loading)
  const error = useWorkflowInstancesStore((state) => state.error)
  const fetchInstancesFromStore = useWorkflowInstancesStore((state) => state.fetchInstances)
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
    return () => {
      clearInstances()
    }
  }, [clearInstances, fetchInstances])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Workflow instances</h2>
          <p className='text-sm text-muted-foreground'>Status and current step of recent instances.</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button asChild variant='outline'>
            <Link to={`/pages/workflows/${workflowId ?? ''}`}>Back</Link>
          </Button>
          <Button
            variant='outline'
            onClick={() => {
              void fetchInstances()
            }}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {!canView && (
        <Card>
          <CardContent className='py-4 text-sm text-muted-foreground'>
            Log in to view workflow instances.
          </CardContent>
        </Card>
      )}

      {error !== null && (
        <Card>
          <CardContent className='py-4 text-sm text-destructive'>{error}</CardContent>
        </Card>
      )}

      {instances.length === 0 && error === null && !loading && canView && (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            No workflow instances found.
          </CardContent>
        </Card>
      )}

      <div className='grid gap-4'>
        {instances.map((instance) => (
          <Card key={instance.instanceId}>
            <CardHeader className='flex flex-row items-start justify-between gap-4'>
              <div className='space-y-1'>
                <CardTitle className='text-base'>Instance {instance.instanceId}</CardTitle>
                <div className='text-xs text-muted-foreground'>
                  Current state: {instance.currentStateName ?? '—'}
                </div>
              </div>
              <span
                className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusStyles[instance.status]}`}
              >
                {instance.status}
              </span>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <Separator />
              <div className='grid gap-2 text-xs text-muted-foreground'>
                <div className='flex flex-wrap gap-2'>
                  <span className='font-medium text-foreground'>Created:</span>
                  <span>{formatTime(instance.createdAt)}</span>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <span className='font-medium text-foreground'>Started:</span>
                  <span>{formatTime(instance.startedAt)}</span>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <span className='font-medium text-foreground'>Completed:</span>
                  <span>{formatTime(instance.completedAt)}</span>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <span className='font-medium text-foreground'>Current job:</span>
                  <span>{instance.currentJobId ?? '—'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
