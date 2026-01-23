import React, { useCallback, useEffect, useMemo, useState } from 'react'
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

interface Workflow {
  id: string
  name: string
  isPrivate: boolean
  enabled: boolean
  triggers: unknown[]
  createdAt: string
  updatedAt: string
  userId?: string | null
}

const formatDateTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

export const Workflows: React.FC = () => {
  const { currentUser } = useUserStore()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState<Record<string, boolean>>({})
  const [lastTriggerResult, setLastTriggerResult] = useState<Record<string, string>>({})

  const canTrigger = useMemo(() => currentUser !== null, [currentUser])
  const hasManualTrigger = useCallback((workflow: Workflow): boolean => (
    workflow.triggers.some((trigger) =>
      typeof trigger === 'object' &&
      trigger !== null &&
      (trigger as { type?: string }).type === 'TRIGGER_MANUAL'
    )
  ), [])

  const fetchWorkflows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/workflow')
      if (response.status === 401) {
        setError('Please log in to view workflows.')
        setWorkflows([])
        return
      }
      if (!response.ok) {
        setError(`Failed to load workflows (HTTP ${response.status}).`)
        return
      }
      const data = await response.json() as { workflows: Workflow[] }
      setWorkflows(data.workflows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkflows().catch(() => undefined)
  }, [fetchWorkflows])

  const triggerWorkflow = useCallback(async (workflowId: string) => {
    setTriggering((prev) => ({ ...prev, [workflowId]: true }))
    setLastTriggerResult((prev) => ({ ...prev, [workflowId]: '' }))
    try {
      const response = await fetch(`/api/workflow/${workflowId}/trigger`, { method: 'POST' })
      if (!response.ok) {
        const message = response.status === 403
          ? 'Forbidden'
          : `Failed (HTTP ${response.status})`
        setLastTriggerResult((prev) => ({ ...prev, [workflowId]: message }))
        return
      }
      setLastTriggerResult((prev) => ({ ...prev, [workflowId]: 'Triggered' }))
    } catch (err) {
      setLastTriggerResult((prev) => ({
        ...prev,
        [workflowId]: err instanceof Error ? err.message : 'Trigger failed'
      }))
    } finally {
      setTriggering((prev) => ({ ...prev, [workflowId]: false }))
    }
  }, [])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Workflows</h2>
          <p className='text-sm text-muted-foreground'>
            Manage and trigger workflows. Definitions are hidden on this page.
          </p>
        </div>
        <Button
          variant='outline'
          onClick={() => {
            void fetchWorkflows()
          }}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {error !== null && (
        <Card>
          <CardContent className='py-4 text-sm text-destructive'>{error}</CardContent>
        </Card>
      )}

      {workflows.length === 0 && error === null && !loading && (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            No workflows found.
          </CardContent>
        </Card>
      )}

      <div className='grid gap-4'>
        {workflows.map((workflow) => (
          <Card key={workflow.id}>
            <CardHeader className='flex flex-row items-start justify-between gap-4'>
              <div className='space-y-1'>
                <CardTitle className='text-base'>{workflow.name}</CardTitle>
                <div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
                  <span>{workflow.isPrivate ? 'Private' : 'Public'}</span>
                  <span>•</span>
                  <span>{workflow.enabled ? 'Enabled' : 'Disabled'}</span>
                  <span>•</span>
                  <span>{workflow.triggers.length} triggers</span>
                </div>
              </div>
              <div className='flex flex-col gap-2'>
                <Button asChild variant='outline'>
                  <Link to={`/pages/workflows/${workflow.id}`}>View</Link>
                </Button>
                {hasManualTrigger(workflow) && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={!canTrigger || triggering[workflow.id]}>
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
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            triggerWorkflow(workflow.id).catch(() => undefined)
                          }}
                        >
                          Trigger
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
                {workflow.userId !== null && workflow.userId !== undefined && workflow.userId !== '' && (
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
              {!canTrigger && (
                <div className='text-xs text-muted-foreground'>
                  Log in to trigger workflows.
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
