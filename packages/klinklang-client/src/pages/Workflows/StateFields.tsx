import React from 'react'
import type { StateDefinition } from './definition'

interface StateFieldsProps {
  state: StateDefinition
  exclude?: string[]
}

export const StateFields: React.FC<StateFieldsProps> = ({ state, exclude = [] }) => (
  <div className='mt-4 grid gap-2 text-xs text-muted-foreground'>
    {Object.entries(state)
      .filter(([key]) => !exclude.includes(key))
      .map(([key, value]) => (
        <div key={key} className='flex flex-wrap gap-2'>
          <span className='font-medium text-foreground'>{key}:</span>
          <span className='break-all'>{typeof value === 'string' ? value : JSON.stringify(value)}</span>
        </div>
      ))}
  </div>
)
