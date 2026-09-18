import { ArrowLeft, CheckCircle2, Circle, Code2, GitBranch, Redo2, Save, Undo2 } from 'lucide-react'
import React from 'react'
import { Link } from 'react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '../../../components/ui/alert-dialog'
import { Button } from '../../../components/ui/button'

interface EditorToolbarProps {
  name: string
  workflowId: string
  revision: number
  stateCount: number
  isDirty: boolean
  mode: 'visual' | 'json'
  saving: boolean
  canEdit: boolean
  canUndo: boolean
  canRedo: boolean
  hasIssues: boolean
  onModeChange: (mode: 'visual' | 'json') => void
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onSave: () => void
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  name,
  workflowId,
  revision,
  stateCount,
  isDirty,
  mode,
  saving,
  canEdit,
  canUndo,
  canRedo,
  hasIssues,
  onModeChange,
  onUndo,
  onRedo,
  onReset,
  onSave
}) => (
  <header className='flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm'>
    <div className='min-w-0'>
      <div className='flex flex-wrap items-center gap-2'>
        <h1 className='break-words text-lg font-semibold tracking-tight'>{name}</h1>
        <span className='shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground'>
          Revision {revision}
        </span>
      </div>
      <p className='mt-1 flex items-center gap-1.5 text-xs text-muted-foreground' role='status'>
        {isDirty
          ? <Circle className='size-2 fill-amber-500 text-amber-500' />
          : <CheckCircle2 className='size-3 text-emerald-600' />}
        {isDirty ? 'Unsaved changes' : 'All changes saved'}
        <span className='px-1'>·</span>
        {stateCount} {stateCount === 1 ? 'state' : 'states'}
      </p>
    </div>
    <div className='flex flex-wrap items-center gap-2'>
      <Button asChild variant='outline'>
        <Link to={`/pages/workflows/${workflowId}`}>
          <ArrowLeft className='size-4' />Back
        </Link>
      </Button>
      <div className='flex rounded-md border bg-muted/40 p-0.5' role='group' aria-label='Editor mode'>
        <Button
          size='sm'
          variant={mode === 'visual' ? 'secondary' : 'ghost'}
          aria-pressed={mode === 'visual'}
          disabled={saving}
          onClick={() => {
            onModeChange('visual')
          }}
        >
          <GitBranch className='size-4' />Visual
        </Button>
        <Button
          size='sm'
          variant={mode === 'json' ? 'secondary' : 'ghost'}
          aria-pressed={mode === 'json'}
          disabled={saving}
          onClick={() => {
            onModeChange('json')
          }}
        >
          <Code2 className='size-4' />JSON
        </Button>
      </div>
      {mode === 'visual' && (
        <div className='flex gap-1' role='group' aria-label='Draft history'>
          <Button
            variant='ghost'
            size='icon'
            aria-label='Undo'
            title='Undo (Ctrl/⌘ Z)'
            disabled={!canEdit || saving || !canUndo}
            onClick={onUndo}
          >
            <Undo2 className='size-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            aria-label='Redo'
            title='Redo (Ctrl/⌘ Shift Z)'
            disabled={!canEdit || saving || !canRedo}
            onClick={onRedo}
          >
            <Redo2 className='size-4' />
          </Button>
        </div>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant='outline' disabled={!isDirty || saving}>Reset</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>All changes made since revision {revision} will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onReset}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button disabled={!canEdit || !isDirty || saving || hasIssues} title='Save revision (Ctrl/⌘ S)' onClick={onSave}>
        <Save className='size-4' />
        {saving ? 'Saving…' : 'Save revision'}
      </Button>
    </div>
  </header>
)
