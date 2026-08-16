import type { ActionJsonSchema } from '@mudkipme/klinklang-domain'
import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Checkbox } from '../../../components/ui/checkbox'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import {
  asFormJsonSchema,
  createDefaultValue,
  humanizeFieldName,
  type FormJsonSchema
} from './schema-form'

interface SchemaDrivenFormProps {
  schema: ActionJsonSchema
  value: unknown
  onChange: (value: Record<string, unknown>) => void
  disabled?: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
)

const toRecord = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {}

interface JsonValueEditorProps {
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

export const JsonValueEditor: React.FC<JsonValueEditorProps> = ({ value, onChange, disabled }) => {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- keep the draft synchronized when another state is selected
    setText(JSON.stringify(value ?? null, null, 2))
  }, [value])
  return (
    <div className='space-y-1'>
      <Textarea
        className='min-h-24 font-mono text-xs'
        value={text}
        disabled={disabled}
        onChange={(event) => {
          setText(event.target.value)
          try {
            const parsed: unknown = JSON.parse(event.target.value)
            setError(null)
            onChange(parsed)
          } catch (_cause: unknown) {
            setError('Invalid JSON')
          }
        }}
      />
      {error !== null && <div className='text-xs text-destructive'>{error}</div>}
    </div>
  )
}

interface RecordEditorProps {
  value: unknown
  onChange: (value: Record<string, unknown>) => void
  disabled?: boolean
}

const RecordEditor: React.FC<RecordEditorProps> = ({ value, onChange, disabled }) => {
  const entries = Object.entries(toRecord(value))
  const updateEntry = (index: number, key: string, entryValue: string): void => {
    const nextEntries: Array<[string, unknown]> = entries.map(([previousKey, previousValue], entryIndex) => (
      entryIndex === index ? [key, entryValue] : [previousKey, previousValue]
    ))
    onChange(Object.fromEntries(nextEntries.filter(([name]) => name.length > 0)))
  }
  return (
    <div className='space-y-2'>
      {entries.map(([key, entryValue], index) => (
        <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2' key={`${key}:${index}`}>
          <Input
            aria-label='Key'
            value={key}
            disabled={disabled}
            onChange={(event) => { updateEntry(index, event.target.value, String(entryValue)) }}
          />
          <Input
            aria-label='Value'
            value={String(entryValue)}
            disabled={disabled}
            onChange={(event) => { updateEntry(index, key, event.target.value) }}
          />
          <Button
            type='button'
            size='sm'
            variant='ghost'
            disabled={disabled}
            onClick={() => { onChange(Object.fromEntries(entries.filter((_, entryIndex) => entryIndex !== index))) }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={disabled}
        onClick={() => {
          let key = 'header'
          let suffix = 2
          while (Object.hasOwn(toRecord(value), key)) {
            key = `header-${suffix}`
            suffix += 1
          }
          onChange({ ...toRecord(value), [key]: '' })
        }}
      >
        Add entry
      </Button>
    </div>
  )
}

interface LiteralEditorProps {
  schema: FormJsonSchema
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

const LiteralEditor: React.FC<LiteralEditorProps> = ({ schema, value, onChange, disabled }) => {
  const enumOptions = schema.enum?.filter((entry): entry is string => typeof entry === 'string')
  const options = schema['x-ui-options'] ?? enumOptions
  if (options !== undefined && options.length > 0) {
    return (
      <select
        className='h-9 w-full rounded-md border bg-background px-3 text-sm'
        value={typeof value === 'string' ? value : options[0]}
        disabled={disabled}
        onChange={(event) => { onChange(event.target.value) }}
      >
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  }
  if (schema.type === 'boolean') {
    return (
      <label className='flex items-center gap-2 text-xs'>
        <Checkbox
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(checked) => { onChange(Boolean(checked)) }}
        />
        Enabled
      </label>
    )
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    return (
      <Input
        type='number'
        step={schema.type === 'integer' ? 1 : 'any'}
        value={typeof value === 'number' ? value : 0}
        disabled={disabled}
        onChange={(event) => { onChange(Number(event.target.value)) }}
      />
    )
  }
  if (schema.type === 'array' && schema.items?.enum !== undefined) {
    const selected: unknown[] = Array.isArray(value) ? value : []
    return (
      <div className='flex flex-wrap gap-3'>
        {schema.items.enum.map(option => (
          <label className='flex items-center gap-2 text-xs' key={String(option)}>
            <Checkbox
              checked={selected.includes(option)}
              disabled={disabled}
              onCheckedChange={(checked) => {
                onChange(checked === true
                  ? [...selected, option]
                  : selected.filter(candidate => !Object.is(candidate, option)))
              }}
            />
            {String(option)}
          </label>
        ))}
      </div>
    )
  }
  if (schema.type === 'object' && schema.additionalProperties !== undefined && schema.properties === undefined) {
    return <RecordEditor value={value} onChange={onChange} disabled={disabled} />
  }
  if (schema.type === 'object' && schema.properties !== undefined) {
    return (
      <ObjectFields
        schema={schema}
        value={toRecord(value)}
        onChange={onChange}
        disabled={disabled}
        nested
      />
    )
  }
  if (schema.type === 'array' || schema.oneOf !== undefined || schema.anyOf !== undefined || schema.type === undefined) {
    return <JsonValueEditor value={value} onChange={onChange} disabled={disabled} />
  }
  const widget = schema['x-ui-widget']
  if (widget === 'textarea' || widget === 'code') {
    return (
      <Textarea
        className={widget === 'code' ? 'min-h-20 font-mono text-xs' : 'min-h-20'}
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        onChange={(event) => { onChange(event.target.value) }}
      />
    )
  }
  return (
    <Input
      type={schema.format === 'uri' ? 'url' : 'text'}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onChange={(event) => { onChange(event.target.value) }}
    />
  )
}

interface ObjectFieldsProps {
  schema: FormJsonSchema
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  disabled?: boolean
  nested?: boolean
}

const ObjectFields: React.FC<ObjectFieldsProps> = ({ schema, value, onChange, disabled, nested = false }) => {
  const properties = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  return (
    <div className={nested ? 'space-y-3 rounded-md border p-3' : 'space-y-4'}>
      {Object.entries(properties).map(([name, propertySchema]) => {
        const expressionKey = `${name}.$`
        const expression = value[expressionKey]
        const expressionMode = expression !== undefined
        const present = name in value || expressionMode
        const setLiteral = (nextValue: unknown): void => {
          onChange(Object.fromEntries([
            ...Object.entries(value).filter(([key]) => key !== expressionKey && key !== name),
            [name, nextValue]
          ]))
        }
        const setExpression = (path: string): void => {
          onChange(Object.fromEntries([
            ...Object.entries(value).filter(([key]) => key !== name && key !== expressionKey),
            [expressionKey, path]
          ]))
        }
        return (
          <div className='space-y-1.5' key={name}>
            <div className='flex items-center justify-between gap-2'>
              <Label>{propertySchema.title ?? humanizeFieldName(name)}{required.has(name) ? '' : ' (optional)'}</Label>
              <div className='flex items-center gap-1'>
                {!required.has(name) && !present && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={disabled}
                    onClick={() => { setLiteral(createDefaultValue(propertySchema)) }}
                  >
                    Add
                  </Button>
                )}
                {present && (
                  <>
                    <Button
                      type='button'
                      variant={expressionMode ? 'ghost' : 'secondary'}
                      size='sm'
                      disabled={disabled}
                      onClick={() => { setLiteral(createDefaultValue(propertySchema)) }}
                    >
                      Value
                    </Button>
                    <Button
                      type='button'
                      variant={expressionMode ? 'secondary' : 'ghost'}
                      size='sm'
                      disabled={disabled}
                      onClick={() => { setExpression('$') }}
                    >
                      JSONPath
                    </Button>
                    {!required.has(name) && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        disabled={disabled}
                        onClick={() => {
                          onChange(Object.fromEntries(
                            Object.entries(value).filter(([key]) => key !== name && key !== expressionKey)
                          ))
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            {propertySchema.description !== undefined && (
              <div className='text-xs text-muted-foreground'>{propertySchema.description}</div>
            )}
            {(present || required.has(name)) && (expressionMode
              ? (
                <Input
                  className='font-mono text-xs'
                  value={typeof expression === 'string' ? expression : '$'}
                  disabled={disabled}
                  onChange={(event) => { setExpression(event.target.value) }}
                />
                )
              : (
                <LiteralEditor
                  schema={propertySchema}
                  value={value[name] ?? createDefaultValue(propertySchema)}
                  onChange={setLiteral}
                  disabled={disabled}
                />
                ))}
          </div>
        )
      })}
      {Object.keys(properties).length === 0 && (
        <JsonValueEditor value={value} onChange={(next) => { onChange(toRecord(next)) }} disabled={disabled} />
      )}
    </div>
  )
}

export const SchemaDrivenForm: React.FC<SchemaDrivenFormProps> = ({ schema, value, onChange, disabled }) => {
  const formSchema = useMemo(() => asFormJsonSchema(schema), [schema])
  if (formSchema.type !== 'object' && formSchema.properties === undefined) {
    return <JsonValueEditor value={value} onChange={(next) => { onChange(toRecord(next)) }} disabled={disabled} />
  }
  return (
    <ObjectFields
      schema={formSchema}
      value={toRecord(value)}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
