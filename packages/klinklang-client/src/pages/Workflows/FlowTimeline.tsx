import React from 'react'
import { buildPath, type StateMachineDefinition } from './definition'
import { ChoiceBlock } from './ChoiceBlock'
import { StateCard } from './StateCard'

interface FlowTimelineProps {
  definition: StateMachineDefinition
}

export const FlowTimeline: React.FC<FlowTimelineProps> = ({ definition }) => {
  const flow = buildPath(definition, definition.StartAt, new Set())

  return (
    <div className='relative space-y-6'>
      <div className='absolute left-5 top-4 hidden h-[calc(100%-2rem)] w-px bg-border lg:block' />
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
        return (
          <StateCard
            key={`${item.name}-${index}`}
            name={item.name}
            state={item.state}
            isStart={index === 0}
            stepLabel={index === 0 ? 'Start' : `Step ${index + 1}`}
          />
        )
      })}
    </div>
  )
}
