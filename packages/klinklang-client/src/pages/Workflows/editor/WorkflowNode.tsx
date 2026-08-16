import type { StateDefinition } from '@mudkipme/klinklang-domain'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CheckCircle2, CircleX, GitBranch, Play, Workflow } from 'lucide-react'
import React from 'react'

export type WorkflowNodeData = {
  name: string
  state: StateDefinition
  isStart: boolean
} & Record<string, unknown>

export type WorkflowCanvasNode = Node<WorkflowNodeData, 'workflow'>

const stateStyle: Record<StateDefinition['Type'], string> = {
  Task: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950',
  Pass: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
  Choice: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950',
  Succeed: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950',
  Fail: 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950'
}

const StateIcon: React.FC<{ type: StateDefinition['Type'] }> = ({ type }) => {
  if (type === 'Choice') return <GitBranch className='size-4' />
  if (type === 'Succeed') return <CheckCircle2 className='size-4' />
  if (type === 'Fail') return <CircleX className='size-4' />
  if (type === 'Pass') return <Play className='size-4' />
  return <Workflow className='size-4' />
}

export const WorkflowNode: React.FC<NodeProps<WorkflowCanvasNode>> = ({ data, selected }) => {
  const { state } = data
  return (
    <div className={`min-w-52 rounded-lg border-2 px-4 py-3 shadow-sm ${stateStyle[state.Type]} ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
      <Handle type='target' position={Position.Left} className='!size-3 !border-2 !border-background !bg-primary' />
      <div className='flex items-start gap-2'>
        <div className='mt-0.5'><StateIcon type={state.Type} /></div>
        <div className='min-w-0 flex-1'>
          <div className='truncate text-sm font-semibold'>{data.name}</div>
          <div className='truncate text-[11px] text-muted-foreground'>
            {state.Type === 'Task' ? state.Resource : state.Type}
          </div>
        </div>
        {data.isStart && (
          <span className='rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground'>Start</span>
        )}
      </div>
      {state.Type === 'Choice' && (
        <div className='mt-2 space-y-1 border-t pt-2 text-[10px] text-muted-foreground'>
          {state.Choices.map((_, index) => (
            <div className='relative' key={index}>
              Rule {index + 1}
              <Handle
                id={`choice:${index}`}
                type='source'
                position={Position.Right}
                className='!size-3 !border-2 !border-background !bg-amber-600'
                style={{ top: 55 + index * 20 }}
              />
            </div>
          ))}
          <div className='relative'>
            Default
            <Handle
              id='default'
              type='source'
              position={Position.Right}
              className='!size-3 !border-2 !border-background !bg-amber-600'
              style={{ top: 55 + state.Choices.length * 20 }}
            />
          </div>
        </div>
      )}
      {(state.Type === 'Task' || state.Type === 'Pass') && (
        <Handle
          id='next'
          type='source'
          position={Position.Right}
          className='!size-3 !border-2 !border-background !bg-primary'
        />
      )}
    </div>
  )
}
