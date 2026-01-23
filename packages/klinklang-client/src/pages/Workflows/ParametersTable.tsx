import React from 'react'

export interface ParameterRow {
  key: string
  value: string
}

interface ParametersTableProps {
  rows: ParameterRow[]
  keyColumnWidth?: number
}

export const ParametersTable: React.FC<ParametersTableProps> = ({ rows, keyColumnWidth = 160 }) => (
  <div className='mt-4 overflow-hidden rounded-lg border'>
    <div className='flex items-center justify-between border-b bg-muted/30 px-3 py-2 text-xs font-medium text-foreground'>
      <span>Parameters</span>
    </div>
    {rows.length === 0
      ? (
        <div className='px-3 py-3 text-xs text-muted-foreground'>
          No parameters.
        </div>
      )
      : (
        <div className='grid text-xs' style={{ gridTemplateColumns: `${keyColumnWidth}px minmax(0, 1fr)` }}>
          {rows.map((row, rowIndex) => (
            <React.Fragment key={row.key}>
              <div className='border-b bg-muted/40 px-3 py-2 font-medium text-foreground'>
                {row.key}
              </div>
              <div className='border-b px-3 py-2 text-muted-foreground'>
                <span className='break-all'>{row.value}</span>
              </div>
              {rowIndex === rows.length - 1 && <div className='hidden' />}
            </React.Fragment>
          ))}
        </div>
      )}
  </div>
)
