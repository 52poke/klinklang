import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import type { ChoiceState, FlowItem } from './definition'
import { getIconMark, getStateLabel } from './definition'
import { StateCard } from './StateCard'

interface ChoiceBlockProps {
  name: string
  state: ChoiceState
  branches: Array<{ label: string; path: FlowItem[] }>
}

export const ChoiceBlock: React.FC<ChoiceBlockProps> = ({ name, state, branches }) => (
  <div className='space-y-4 relative z-10'>
    <Card className='relative z-10'>
      <CardHeader className='flex flex-row items-start gap-4'>
        <div className='hidden h-10 w-10 items-center justify-center rounded-full border bg-background text-sm font-semibold shadow-sm lg:flex'>
          {getIconMark(state)}
        </div>
        <div className='space-y-1'>
          <CardTitle className='text-base'>{name}</CardTitle>
          <div className='text-xs text-muted-foreground'>
            {getStateLabel(state)}
          </div>
        </div>
        <div className='ml-auto text-xs text-muted-foreground'>Choice</div>
      </CardHeader>
    </Card>
    <div className='relative grid gap-4 pt-6 sm:grid-cols-2'>
      <div className='pointer-events-none absolute left-5 top-2 h-4 w-px bg-border' />
      <div className='pointer-events-none absolute right-[calc(50%-1.5rem)] top-4 hidden h-4 w-px bg-border sm:block' />
      <div className='pointer-events-none absolute left-5 right-[calc(50%-1.5rem)] top-4 h-px bg-border' />
      {branches.map((branch, branchIndex) => (
        <Card
          key={`${name}-branch-${branchIndex}`}
          className='relative border-dashed before:absolute before:left-6 before:top-0 before:h-4 before:w-px before:-translate-y-full before:bg-border before:content-[\"\"]'
        >
          <CardHeader>
            <CardTitle className='text-sm'>{branch.label}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {branch.path.map((branchItem, branchPathIndex) => {
              if (branchItem.kind !== 'state') {
                return null
              }
              const isEnd = branchPathIndex === branch.path.length - 1
              return (
                <StateCard
                  key={`${branchItem.name}-${branchPathIndex}`}
                  name={branchItem.name}
                  state={branchItem.state}
                  variant='branch'
                  isEnd={isEnd}
                  stepLabel={isEnd ? 'End' : 'Step'}
                />
              )
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
)
