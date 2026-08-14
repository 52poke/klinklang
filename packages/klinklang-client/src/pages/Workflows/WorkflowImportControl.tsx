import {
  workflowImportRequestSchema,
  workflowMutationResponseSchema,
  type WorkflowMetadata
} from '@mudkipme/klinklang-domain'
import React, { useCallback, useState } from 'react'
import { Button } from '../../components/ui/button'
import { readJson } from '../../lib/api'

export const WorkflowImportControl: React.FC<{
  onImported: (workflow: WorkflowMetadata) => void
}> = ({ onImported }) => {
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importFile = useCallback(async (file: File) => {
    setImporting(true)
    setError(null)
    try {
      const input: unknown = JSON.parse(await file.text())
      const document = workflowImportRequestSchema.parse(input)
      const response = await fetch('/api/workflow/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document)
      })
      if (!response.ok) throw new Error(`Failed to import workflow (HTTP ${response.status}).`)
      const data = workflowMutationResponseSchema.parse(await readJson(response))
      onImported(data.workflow)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to import workflow.')
    } finally {
      setImporting(false)
    }
  }, [onImported])

  return (
    <div className='flex flex-col items-end gap-1'>
      <Button asChild variant='outline' disabled={importing}>
        <label className='cursor-pointer'>
          {importing ? 'Importing…' : 'Import workflow'}
          <input
            className='hidden'
            type='file'
            accept='application/json,.json'
            disabled={importing}
            onChange={(event) => {
              const input = event.currentTarget
              const file = input.files?.[0]
              input.value = ''
              if (file !== undefined) void importFile(file)
            }}
          />
        </label>
      </Button>
      {error !== null && <span className='max-w-64 text-right text-xs text-destructive'>{error}</span>}
    </div>
  )
}
