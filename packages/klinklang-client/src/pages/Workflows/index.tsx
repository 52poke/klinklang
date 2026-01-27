import React, { useCallback, useEffect, useMemo } from 'react'
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
import { useWorkflowListStore, type WorkflowSummary } from '../../store/workflows'
import { WorkflowCreateDialog } from './WorkflowCreateDialog'

const formatDateTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

export const Workflows: React.FC = () => {
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
  const hasManualTrigger = useCallback((workflow: WorkflowSummary): boolean => (
    workflow.triggers.some((trigger) =>
      typeof trigger === 'object'
      && trigger !== null
      && (trigger as { type?: string }).type === 'TRIGGER_MANUAL'
    )
  ), [])

  const refreshWorkflows = useCallback(() => {
    void fetchWorkflows()
  }, [fetchWorkflows])

  useEffect(() => {
    void fetchWorkflows()
  }, [fetchWorkflows])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Workflows</h2>
          <p className='text-sm text-muted-foreground'>
            Manage and trigger workflows.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {canCreate && (
            <WorkflowCreateDialog
              userId={currentUser?.id ?? null}
              onCreated={(workflow) => {
                addWorkflow(workflow)
              }}
            />
          )}
          <Button
            variant='outline'
            onClick={() => {
              refreshWorkflows()
            }}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
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
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
