import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import type { StateDefinition } from './definition'
import { getIconMark, getParameterRows, getStateLabel } from './definition'
import { ParametersTable } from './ParametersTable'
import { StateFields } from './StateFields'

interface StateCardProps {
  name: string
  state: StateDefinition
  variant?: 'main' | 'branch'
  isStart?: boolean
  isEnd?: boolean
  stepLabel?: string
}

export const StateCard: React.FC<StateCardProps> = ({
  name,
  state,
  variant = 'main',
  isStart = false,
  isEnd = false,
  stepLabel
}) => {
  const rows = getParameterRows(state)
  const keyColumnWidth = variant === 'branch' ? 140 : 160

  return (
    <Card className={variant === 'branch' ? 'shadow-none' : 'relative z-10'}>
      <CardHeader className='flex flex-row items-start gap-4'>
        {variant === 'main' && (
          <div
            className={[
              'hidden h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold shadow-sm lg:flex',
              isStart ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : '',
              isEnd ? 'bg-rose-50 text-rose-700 border-rose-200' : '',
              !isStart && !isEnd ? 'bg-background' : ''
            ].join(' ')}
          >
            {getIconMark(state)}
          </div>
        )}
        <div className='space-y-1'>
          <CardTitle className={variant === 'branch' ? 'text-sm' : 'text-base'}>
            {name}
          </CardTitle>
          <div className='text-xs text-muted-foreground'>
            {getStateLabel(state)}
          </div>
        </div>
        {typeof stepLabel === 'string' && stepLabel.length > 0 && (
          <div className='ml-auto text-xs text-muted-foreground'>
            {stepLabel}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Separator />
        <StateFields state={state} exclude={['Parameters']} />
        <ParametersTable rows={rows} keyColumnWidth={keyColumnWidth} />
      </CardContent>
    </Card>
  )
}
