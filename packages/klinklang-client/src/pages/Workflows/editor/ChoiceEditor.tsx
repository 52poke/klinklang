import {
  type ChoiceRule,
  choiceRuleConditionSchema,
  type ChoiceState,
  type StateMachineDefinition
} from '@mudkipme/klinklang-domain'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import React from 'react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'

const operators = [
  ['StringEquals', 'Text equals', 'text'],
  ['StringMatches', 'Text matches pattern', 'text'],
  ['NumericEquals', 'Number equals', 'number'],
  ['NumericLessThan', 'Number is less than', 'number'],
  ['NumericGreaterThan', 'Number is greater than', 'number'],
  ['NumericLessThanEquals', 'Number is at most', 'number'],
  ['NumericGreaterThanEquals', 'Number is at least', 'number'],
  ['NumericEqualsPath', 'Number equals path', 'path'],
  ['NumericLessThanPath', 'Number is less than path', 'path'],
  ['NumericGreaterThanPath', 'Number is greater than path', 'path'],
  ['NumericLessThanEqualsPath', 'Number is at most path', 'path'],
  ['NumericGreaterThanEqualsPath', 'Number is at least path', 'path'],
  ['BooleanEquals', 'Boolean equals', 'boolean'],
  ['IsPresent', 'Is present', 'boolean'],
  ['IsNull', 'Is null', 'boolean'],
  ['IsString', 'Is text', 'boolean'],
  ['IsNumeric', 'Is a number', 'boolean']
] as const
const selectClass = 'h-9 w-full rounded-md border bg-background px-2 text-sm'

interface ChoiceEditorProps {
  state: ChoiceState
  definition: StateMachineDefinition
  onChange: (state: ChoiceState) => void
  onOpenJson: () => void
  disabled: boolean
}

export const ChoiceEditor: React.FC<ChoiceEditorProps> = ({ state, definition, onChange, onOpenJson, disabled }) => {
  const names = Object.keys(definition.States)
  const updateRule = (index: number, next: ChoiceRule): void => {
    onChange({ ...state, Choices: state.Choices.map((rule, position) => position === index ? next : rule) })
  }
  const moveRule = (index: number, direction: number): void => {
    const choices = [...state.Choices]
    const target = index + direction
    if (target < 0 || target >= choices.length) return
    ;[choices[index], choices[target]] = [choices[target], choices[index]]
    onChange({ ...state, Choices: choices })
  }
  return (
    <section className='space-y-3'>
      <div>
        <h3 className='text-sm font-semibold'>Branch conditions</h3>
        <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
          Rules run from top to bottom. The first match determines the next state.
        </p>
      </div>
      {state.Choices.map((rule, index) => {
        const operator = operators.find(([key]) => key in rule)
        const value = operator === undefined ? undefined : (rule as unknown as Record<string, unknown>)[operator[0]]
        const setCondition = (key: string, nextValue: unknown): void => {
          if (!('Variable' in rule)) return
          const parsed = choiceRuleConditionSchema.safeParse({ Variable: rule.Variable, [key]: nextValue })
          if (parsed.success) updateRule(index, { ...parsed.data, Next: rule.Next })
        }
        return (
          <div className='space-y-2 rounded-lg border bg-muted/20 p-3' key={index}>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold'>Rule {index + 1}</span>
              <div className='flex'>
                <Button
                  size='icon'
                  className='size-7'
                  variant='ghost'
                  aria-label={`Move rule ${index + 1} up`}
                  disabled={disabled || index === 0}
                  onClick={() => {
                    moveRule(index, -1)
                  }}
                >
                  <ArrowUp className='size-3.5' />
                </Button>
                <Button
                  size='icon'
                  className='size-7'
                  variant='ghost'
                  aria-label={`Move rule ${index + 1} down`}
                  disabled={disabled || index === state.Choices.length - 1}
                  onClick={() => {
                    moveRule(index, 1)
                  }}
                >
                  <ArrowDown className='size-3.5' />
                </Button>
                <Button
                  size='icon'
                  className='size-7 text-destructive'
                  variant='ghost'
                  aria-label={`Delete rule ${index + 1}`}
                  disabled={disabled || state.Choices.length === 1}
                  onClick={() => {
                    onChange({ ...state, Choices: state.Choices.filter((_, position) => position !== index) })
                  }}
                >
                  <Trash2 className='size-3.5' />
                </Button>
              </div>
            </div>
            {'Variable' in rule && operator !== undefined
              ? (
                <>
                  <label className='block space-y-1 text-xs font-medium'>
                    <span>Value path</span>
                    <Input
                      aria-label={`Rule ${index + 1} value path`}
                      className='font-mono text-xs'
                      value={rule.Variable}
                      disabled={disabled}
                      onChange={(event) => {
                        updateRule(index, { ...rule, Variable: event.target.value })
                      }}
                      placeholder='$.value'
                    />
                  </label>
                  <select
                    className={selectClass}
                    aria-label={`Rule ${index + 1} comparison`}
                    value={operator[0]}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = operators.find(([key]) => key === event.target.value)
                      if (next !== undefined) {
                        setCondition(
                          next[0],
                          next[2] === 'boolean' ? true : next[2] === 'number' ? 0 : next[2] === 'path' ? '$.value' : ''
                        )
                      }
                    }}
                  >
                    {operators.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  {operator[2] === 'boolean'
                    ? (
                      <select
                        className={selectClass}
                        aria-label={`Rule ${index + 1} comparison value`}
                        value={String(value)}
                        disabled={disabled}
                        onChange={(event) => {
                          setCondition(operator[0], event.target.value === 'true')
                        }}
                      >
                        <option value='true'>True</option>
                        <option value='false'>False</option>
                      </select>
                    )
                    : (
                      <Input
                        aria-label={`Rule ${index + 1} comparison value`}
                        type={operator[2] === 'number' ? 'number' : 'text'}
                        step='any'
                        value={String(value)}
                        disabled={disabled}
                        onChange={(event) => {
                          setCondition(
                            operator[0],
                            operator[2] === 'number' ? Number(event.target.value) : event.target.value
                          )
                        }}
                      />
                    )}
                </>
              )
              : (
                <div className='space-y-2 text-xs'>
                  <p className='text-muted-foreground'>This rule combines conditions. Edit its expression in JSON.</p>
                  <Button variant='outline' size='sm' onClick={onOpenJson}>Open JSON</Button>
                </div>
              )}
            <label className='block space-y-1 text-xs font-medium'>
              <span>Then go to</span>
              <select
                className={selectClass}
                aria-label={`Rule ${index + 1} next state`}
                value={rule.Next}
                disabled={disabled}
                onChange={(event) => {
                  updateRule(index, { ...rule, Next: event.target.value })
                }}
              >
                {!names.includes(rule.Next) && <option value={rule.Next}>{rule.Next} (missing)</option>}
                {names.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
        )
      })}
      <Button
        size='sm'
        variant='outline'
        className='w-full'
        disabled={disabled}
        onClick={() => {
          onChange({ ...state, Choices: [...state.Choices, { Variable: '$.value', IsPresent: true, Next: names[0] }] })
        }}
      >
        <Plus className='size-4' />Add rule
      </Button>
      <label className='block space-y-1.5 text-sm font-medium'>
        <span>Otherwise</span>
        <select
          className={selectClass}
          aria-label='Default next state'
          value={state.Default ?? ''}
          disabled={disabled}
          onChange={(event) => {
            onChange({ ...state, Default: event.target.value.length > 0 ? event.target.value : undefined })
          }}
        >
          <option value=''>No fallback (fail if no rule matches)</option>
          {state.Default !== undefined && !names.includes(state.Default) && (
            <option value={state.Default}>{state.Default} (missing)</option>
          )}
          {names.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </section>
  )
}
