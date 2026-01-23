import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { useUserStore } from '../../store/user'
import type { StateMachineDefinition } from './definition'
import { FlowTimeline } from './FlowTimeline'
import { WorkflowMeta, type WorkflowMetaData } from './WorkflowMeta'

export const WorkflowDetail: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>()
  const { currentUser } = useUserStore()
  const [definition, setDefinition] = useState<StateMachineDefinition | null>(null)
  const [workflow, setWorkflow] = useState<WorkflowMetaData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canView = useMemo(() => currentUser !== null, [currentUser])

  const fetchActions = useCallback(async () => {
    if (workflowId === undefined) {
      setError('Missing workflow id.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/workflow/${workflowId}/actions`)
      if (response.status === 401) {
        setError('Please log in to view workflow details.')
        setDefinition(null)
        setWorkflow(null)
        return
      }
      if (!response.ok) {
        setError(`Failed to load workflow actions (HTTP ${response.status}).`)
        return
      }
      const data = await response.json() as { definition: StateMachineDefinition; workflow: WorkflowMetaData }
      setDefinition(data.definition)
      setWorkflow(data.workflow)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow actions.')
    } finally {
      setLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    fetchActions().catch(() => undefined)
  }, [fetchActions])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Workflow detail</h2>
          <p className='text-sm text-muted-foreground'>Read-only ASL node list.</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button asChild variant='outline'>
            <Link to='/pages/workflows'>Back</Link>
          </Button>
          <Button asChild variant='outline'>
            <Link to={`/pages/workflows/${workflowId ?? ''}/instances`}>Instances</Link>
          </Button>
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

      {(definition === null || Object.keys(definition.States).length === 0) && error === null && !loading && canView && (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            No nodes available.
          </CardContent>
        </Card>
      )}

      {definition !== null && (
        <div className='grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]'>
          {workflow !== null && <WorkflowMeta workflow={workflow} />}
          <FlowTimeline definition={definition} />
        </div>
      )}
    </div>
  )
}
