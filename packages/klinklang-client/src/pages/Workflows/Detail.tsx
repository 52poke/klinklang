import React, { useCallback, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { useUserStore } from '../../store/user'
import { useWorkflowDetailStore } from '../../store/workflows'
import type { StateMachineDefinition } from './definition'
import { FlowTimeline } from './FlowTimeline'
import { WorkflowEditDialog } from './WorkflowEditDialog'
import { WorkflowMeta, type WorkflowMetaData } from './WorkflowMeta'

export const WorkflowDetail: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>()
  const { currentUser } = useUserStore()
  const definition = useWorkflowDetailStore((state) => state.definition)
  const workflow = useWorkflowDetailStore((state) => state.workflow)
  const loading = useWorkflowDetailStore((state) => state.loading)
  const error = useWorkflowDetailStore((state) => state.error)
  const fetchDetail = useWorkflowDetailStore((state) => state.fetchDetail)
  const setWorkflowDetail = useWorkflowDetailStore((state) => state.setWorkflow)
  const setDetailError = useWorkflowDetailStore((state) => state.setError)
  const clearDetail = useWorkflowDetailStore((state) => state.clear)

  const canView = useMemo(() => currentUser !== null, [currentUser])
  const canEdit = useMemo(() => {
    if (currentUser === null || workflow === null) {
      return false
    }
    const isOwner = workflow.userId !== null && workflow.userId !== undefined && workflow.userId === currentUser.id
    if (workflow.isPrivate) {
      return isOwner
    }
    return isOwner || currentUser.groups.includes('sysop')
  }, [currentUser, workflow])

  const fetchActions = useCallback(async () => {
    if (workflowId === undefined) {
      setDetailError('Missing workflow id.')
      return
    }
    await fetchDetail(workflowId)
  }, [fetchDetail, setDetailError, workflowId])

  useEffect(() => {
    void fetchActions()
    return () => {
      clearDetail()
    }
  }, [clearDetail, fetchActions])

  const handleWorkflowUpdated = useCallback((workflowData: WorkflowMetaData, definitionData: StateMachineDefinition) => {
    setWorkflowDetail(workflowData, definitionData)
  }, [setWorkflowDetail])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Workflow detail</h2>
          <p className='text-sm text-muted-foreground'>Workflow information and tasks.</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button asChild variant='outline'>
            <Link to='/pages/workflows'>Back</Link>
          </Button>
          <Button asChild variant='outline'>
            <Link to={`/pages/workflows/${workflowId ?? ''}/instances`}>Instances</Link>
          </Button>
          {workflow !== null && definition !== null && canEdit && (
            <WorkflowEditDialog
              workflowId={workflowId ?? ''}
              workflow={workflow}
              definition={definition}
              onUpdated={handleWorkflowUpdated}
            />
          )}
          <Button
            variant='outline'
            onClick={() => {
              void fetchActions()
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
            Log in to view workflow details.
          </CardContent>
        </Card>
      )}

      {error !== null && (
        <Card>
          <CardContent className='py-4 text-sm text-destructive'>{error}</CardContent>
        </Card>
      )}

      {(definition === null || Object.keys(definition.States).length === 0) && error === null && !loading && canView
        && (
          <Card>
            <CardContent className='py-6 text-sm text-muted-foreground'>
              No nodes available.
            </CardContent>
          </Card>
        )}

      {definition !== null && (
        <div className='grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]'>
          <div className='flex flex-col gap-4'>
            {workflow !== null && <WorkflowMeta workflow={workflow} />}
          </div>
          <FlowTimeline definition={definition} />
        </div>
      )}
    </div>
  )
}
