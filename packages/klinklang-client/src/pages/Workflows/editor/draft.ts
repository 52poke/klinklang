import {
  type ActionCatalogEntry,
  type StateMachineDefinition,
  stateMachineDefinitionSchema,
  validateWorkflowGraph
} from '@mudkipme/klinklang-domain'
import { validateParameterTemplate } from './schema-form'

export const validateDefinition = (definition: StateMachineDefinition, actions: ActionCatalogEntry[]): string[] => {
  const parsed = stateMachineDefinitionSchema.safeParse(definition)
  if (!parsed.success) return parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
  const issues = [...validateWorkflowGraph(definition)]
  if (actions.length === 0) return issues
  for (const [stateName, state] of Object.entries(definition.States)) {
    if (state.Type !== 'Task') continue
    const action = actions.find(candidate => candidate.type === state.Resource)
    if (action === undefined) {
      issues.push(`States.${stateName}.Resource: unsupported action ${state.Resource}`)
      continue
    }
    issues.push(
      ...validateParameterTemplate(state.Parameters ?? {}, action.inputSchema)
        .map(issue => `States.${stateName}.${issue}`)
    )
  }
  return Array.from(new Set(issues))
}

export const parseDefinition = (text: string): { definition: StateMachineDefinition | null; issues: string[] } => {
  try {
    const parsed = stateMachineDefinitionSchema.safeParse(JSON.parse(text) as unknown)
    return parsed.success
      ? { definition: parsed.data, issues: [] }
      : { definition: null, issues: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) }
  } catch (cause) {
    return {
      definition: null,
      issues: [`Invalid JSON: ${cause instanceof Error ? cause.message : 'Unable to parse definition'}`]
    }
  }
}

export interface DraftHistory {
  past: StateMachineDefinition[]
  present: StateMachineDefinition | null
  future: StateMachineDefinition[]
}
export type DraftAction =
  | { type: 'reset' | 'edit'; definition: StateMachineDefinition }
  | { type: 'undo' | 'redo' }

export const draftReducer = (history: DraftHistory, action: DraftAction): DraftHistory => {
  if (action.type === 'reset') return { past: [], present: action.definition, future: [] }
  if (action.type === 'edit') {
    if (JSON.stringify(action.definition) === JSON.stringify(history.present)) return history
    return {
      past: history.present === null ? [] : [...history.past, history.present].slice(-100),
      present: action.definition,
      future: []
    }
  }
  if (history.present === null) return history
  if (action.type === 'undo') {
    const previous = history.past.at(-1)
    return previous === undefined ? history : {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future]
    }
  }
  const next = history.future.at(0)
  return next === undefined ? history : {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1)
  }
}
