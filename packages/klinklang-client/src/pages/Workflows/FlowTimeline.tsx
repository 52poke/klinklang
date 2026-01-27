import React from 'react'
import { buildPath, type StateMachineDefinition } from './definition'
import { ChoiceBlock } from './ChoiceBlock'
import { StateCard } from './StateCard'

interface FlowTimelineProps {
  definition: StateMachineDefinition
}

export const FlowTimeline: React.FC<FlowTimelineProps> = ({ definition }) => {
  const flow = buildPath(definition, definition.StartAt, new Set())
  const showLine = flow.length > 1

  return (
    <div className='relative space-y-6'>
      {showLine && (
        <div className='absolute left-5 top-4 z-0 hidden h-[calc(100%-2rem)] w-px bg-border lg:block' />
      )}
      {flow.map((item, index) => {
        if (item.kind === 'choice') {
          return (
            <ChoiceBlock
              key={`${item.name}-${index}`}
              name={item.name}
              state={item.state}
              branches={item.branches}
            />
          )
        }
        const isStart = index === 0
        const isEnd = index === flow.length - 1
        return (
          <StateCard
            key={`${item.name}-${index}`}
            name={item.name}
            state={item.state}
            isStart={isStart}
            isEnd={isEnd}
            stepLabel={isStart ? 'Start' : isEnd ? 'End' : `Step ${index + 1}`}
          />
        )
      })}
    </div>
  )
}
