import type { ActionCatalogEntry, StateDefinition } from '@mudkipme/klinklang-domain'
import { CircleX, GitBranch, Play, Search, Workflow } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'

const statePalette: Array<{
  type: Exclude<StateDefinition['Type'], 'Task'>
  label: string
  description: string
  icon: React.ReactNode
}> = [
  { type: 'Choice', label: 'Choice', description: 'Branch using conditions.', icon: <GitBranch className='size-4' /> },
  { type: 'Pass', label: 'Pass', description: 'Transform or forward workflow context.', icon: <Play className='size-4' /> },
  { type: 'Succeed', label: 'Succeed', description: 'Complete the workflow successfully.', icon: <Workflow className='size-4' /> },
  { type: 'Fail', label: 'Fail', description: 'Stop with an error and cause.', icon: <CircleX className='size-4' /> }
]

interface ActionPaletteProps {
  actions: ActionCatalogEntry[]
  loading: boolean
  disabled: boolean
  error: string | null
  onRetry: () => void
  onAddAction: (action: ActionCatalogEntry) => void
  onAddState: (type: 'Pass' | 'Succeed' | 'Fail' | 'Choice') => void
}

export const ActionPalette: React.FC<ActionPaletteProps> = ({ actions, loading, disabled, error, onRetry, onAddAction, onAddState }) => {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized.length === 0
      ? actions
      : actions.filter(action => (
        action.type.toLowerCase().includes(normalized) ||
        action.display.label.toLowerCase().includes(normalized) ||
        action.display.description.toLowerCase().includes(normalized)
      ))
  }, [actions, query])
  const filteredStates = statePalette.filter(item => `${item.label} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const categories = useMemo(() => Array.from(new Set(filtered.map(action => action.display.category))), [filtered])

  return (
    <aside className='h-full overflow-y-auto bg-card p-4'>
      <div className='mb-3'>
        <div className='text-sm font-semibold'>Add a state</div>
        <div className='text-xs text-muted-foreground'>Choose a step, then connect its output to the next state.</div>
      </div>
      <div className='relative mb-4'>
        <Search className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
        <Input className='pl-8' value={query} aria-label='Search states and actions' placeholder='Search states…' onChange={(event) => { setQuery(event.target.value) }} />
      </div>
      <div className='space-y-4'>
        {filteredStates.length > 0 && <section className='space-y-2'>
          <div className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>Flow control</div>
          {filteredStates.map(item => (
            <button
              type='button'
              className='flex w-full items-start gap-2 rounded-md border p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50'
              disabled={disabled}
              onClick={() => { onAddState(item.type) }}
              key={item.type}
            >
              <span className='mt-0.5'>{item.icon}</span>
              <span>
                <span className='block text-xs font-medium'>{item.label}</span>
                <span className='block text-xs leading-relaxed text-muted-foreground'>{item.description}</span>
              </span>
            </button>
          ))}
        </section>}
        {error !== null && <div role='alert' className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs'><p>{error}</p><Button className='mt-2' size='sm' variant='outline' onClick={onRetry}>Retry catalog</Button></div>}
        {!loading && error === null && filtered.length === 0 && filteredStates.length === 0 && <p className='py-6 text-center text-sm text-muted-foreground'>No states match “{query}”. Try another search.</p>}
        {loading && <div className='text-xs text-muted-foreground'>Loading action catalog…</div>}
        {categories.map(category => (
          <section className='space-y-2' key={category}>
            <div className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>{category}</div>
            {filtered.filter(action => action.display.category === category).map(action => (
              <button
                type='button'
                className='w-full rounded-md border p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50'
                disabled={disabled}
                onClick={() => { onAddAction(action) }}
                key={action.type}
              >
                <span className='block text-xs font-medium'>{action.display.label}</span>
                <span className='block text-xs leading-relaxed text-muted-foreground'>{action.display.description}</span>

              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}

