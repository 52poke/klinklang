import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import { useUserStore } from '../../store/user'

interface WorkflowAction {
  name: string
  state: Record<string, unknown>
}

const getStateLabel = (state: Record<string, unknown>): string => {
  const type = typeof state.Type === 'string' ? state.Type : 'State'
  const resource = typeof state.Resource === 'string' ? state.Resource : ''
  if (resource.length > 0) {
    return `${type} • ${resource}`
  }
  return type
}

const getIconMark = (state: Record<string, unknown>): string => {
  const type = typeof state.Type === 'string' ? state.Type : 'S'
  return type.slice(0, 1).toUpperCase()
}

const getParameterRows = (state: Record<string, unknown>): Array<{ key: string; value: string }> => {
  const parameters = state.Parameters
  if (parameters === null || parameters === undefined || typeof parameters !== 'object') {
    return []
  }
  return Object.entries(parameters as Record<string, unknown>)
    .map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    }))
}

export const WorkflowDetail: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>()
  const { currentUser } = useUserStore()
  const [actions, setActions] = useState<WorkflowAction[]>([])
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
        setActions([])
        return
      }
      if (!response.ok) {
        setError(`Failed to load workflow actions (HTTP ${response.status}).`)
        return
      }
      const data = await response.json() as { actions: WorkflowAction[] }
      setActions(data.actions)
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
          <Button variant='outline' onClick={fetchActions} disabled={loading}>
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

      {actions.length === 0 && error === null && !loading && canView && (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            No nodes available.
          </CardContent>
        </Card>
      )}

      <div className='grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]'>
        <Card className='h-fit'>
          <CardHeader>
            <CardTitle className='text-sm'>Node list</CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {actions.map((action, index) => (
              <div key={`${action.name}-${index}`} className='rounded-md border px-3 py-2 text-xs'>
                <div className='font-medium text-foreground'>{index + 1}. {action.name}</div>
                <div className='text-muted-foreground'>{getStateLabel(action.state)}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className='relative space-y-6'>
          <div className='absolute left-5 top-4 hidden h-[calc(100%-2rem)] w-px bg-border lg:block' />
          {actions.map((action, index) => {
            const isStart = index === 0
            const isEnd = index === actions.length - 1
            const rows = getParameterRows(action.state)
            return (
              <Card key={`${action.name}-${index}`} className='relative'>
                <CardHeader className='flex flex-row items-start gap-4'>
                  <div
                    className={[
                      'hidden h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold shadow-sm lg:flex',
                      isStart ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : '',
                      isEnd ? 'bg-rose-50 text-rose-700 border-rose-200' : '',
                      !isStart && !isEnd ? 'bg-background' : ''
                    ].join(' ')}
                  >
                    {getIconMark(action.state)}
                  </div>
                  <div className='space-y-1'>
                    <CardTitle className='text-base'>
                      {action.name}
                    </CardTitle>
                    <div className='text-xs text-muted-foreground'>
                      {getStateLabel(action.state)}
                    </div>
                  </div>
                  <div className='ml-auto text-xs text-muted-foreground'>
                    {index === 0 ? 'Start' : index === actions.length - 1 ? 'End' : `Step ${index + 1}`}
                  </div>
                </CardHeader>
                <CardContent>
                  <Separator />
                  <div className='mt-4 grid gap-2 text-xs text-muted-foreground'>
                    {Object.entries(action.state)
                      .filter(([key]) => key !== 'States' && key !== 'Parameters')
                      .map(([key, value]) => (
                        <div key={key} className='flex flex-wrap gap-2'>
                          <span className='font-medium text-foreground'>{key}:</span>
                          <span className='break-all'>{typeof value === 'string' ? value : JSON.stringify(value)}</span>
                        </div>
                      ))}
                  </div>
                  <div className='mt-4 overflow-hidden rounded-lg border'>
                    <div className='flex items-center justify-between border-b bg-muted/30 px-3 py-2 text-xs font-medium text-foreground'>
                      <span>Parameters</span>
                    </div>
                    {rows.length === 0
                      ? (
                        <div className='px-3 py-3 text-xs text-muted-foreground'>
                          No parameters.
                        </div>
                      )
                      : (
                        <div className='grid grid-cols-[160px_minmax(0,1fr)] text-xs'>
                          {rows.map((row, rowIndex) => (
                            <React.Fragment key={row.key}>
                              <div className='border-b bg-muted/40 px-3 py-2 font-medium text-foreground'>
                                {row.key}
                              </div>
                              <div className='border-b px-3 py-2 text-muted-foreground'>
                                <span className='break-all'>{row.value}</span>
                              </div>
                              {rowIndex === rows.length - 1 && <div className='hidden' />}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
