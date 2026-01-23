import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import type { StateMachineDefinition } from './definition'
import { collectStateNames, getStateLabel } from './definition'

interface NodeListProps {
  definition: StateMachineDefinition
}

export const NodeList: React.FC<NodeListProps> = ({ definition }) => (
  <Card className='h-fit'>
    <CardHeader>
      <CardTitle className='text-sm'>Node list</CardTitle>
    </CardHeader>
    <CardContent className='space-y-2'>
      {collectStateNames(definition).map((name, index) => {
        const state = definition.States[name]
        return (
          <div key={`${name}-${index}`} className='rounded-md border px-3 py-2 text-xs'>
            <div className='font-medium text-foreground'>{index + 1}. {name}</div>
            <div className='text-muted-foreground'>{getStateLabel(state)}</div>
          </div>
        )
      })}
    </CardContent>
  </Card>
)
