import { json, jsonParseLinter } from '@codemirror/lang-json'
import { linter } from '@codemirror/lint'
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state'
import { basicSetup, EditorView } from 'codemirror'
import { Braces } from 'lucide-react'
import React, { useEffect, useEffectEvent, useRef } from 'react'
import { Button } from '../../../components/ui/button'

const externalChange = Annotation.define<boolean>()
const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--card)', color: 'var(--foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono, monospace)' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--foreground)' },
  '.cm-gutters': { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-panels, .cm-tooltip': { backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)' }
})

interface DefinitionEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly: boolean
}

export const DefinitionEditor: React.FC<DefinitionEditorProps> = ({ value, onChange, readOnly }) => {
  const container = useRef<HTMLDivElement>(null)
  const editor = useRef<{ view: EditorView; permissions: Compartment } | null>(null)
  const emitChange = useEffectEvent((next: string) => { onChange(next) })

  useEffect(() => {
    if (container.current === null) return
    const permissions = new Compartment()
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({
        extensions: [
          basicSetup,
          json(),
          linter(jsonParseLinter()),
          editorTheme,
          permissions.of([EditorState.readOnly.of(true), EditorView.editable.of(false)]),
          EditorView.contentAttributes.of({ 'aria-label': 'Workflow definition JSON', tabindex: '0' }),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalChange) === true)) {
              emitChange(update.state.doc.toString())
            }
          })
        ]
      })
    })
    editor.current = { view, permissions }
    return () => {
      editor.current = null
      view.destroy()
    }
  }, [])

  useEffect(() => {
    const view = editor.current?.view
    if (view === undefined || view.state.doc.toString() === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: [externalChange.of(true), Transaction.addToHistory.of(false)]
    })
  }, [value])

  useEffect(() => {
    const current = editor.current
    if (current === null) return
    current.view.dispatch({
      effects: current.permissions.reconfigure([
        EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ 'aria-readonly': String(readOnly) })
      ])
    })
  }, [readOnly])

  const format = (): void => {
    const view = editor.current?.view
    if (view === undefined || readOnly) return
    try {
      const parsed: unknown = JSON.parse(view.state.doc.toString())
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: JSON.stringify(parsed, null, 2) }, userEvent: 'input' })
      view.focus()
    } catch (_cause: unknown) {
      // Syntax diagnostics and the draft validation panel explain what needs fixing.
      view.focus()
    }
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex shrink-0 items-center justify-between border-b bg-muted/30 px-3 py-1.5'>
        <span className='text-xs text-muted-foreground'>JSON{readOnly ? ' · Read only' : ''}</span>
        <Button size='sm' variant='ghost' disabled={readOnly} onClick={format}><Braces className='size-4' />Format JSON</Button>
      </div>
      <div ref={container} className='min-h-0 flex-1 overflow-hidden' />
    </div>
  )
}
