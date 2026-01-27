import { create } from 'zustand'
import type { StateMachineDefinition } from '../pages/Workflows/definition'
import type { WorkflowMetaData } from '../pages/Workflows/WorkflowMeta'

export interface WorkflowSummary {
  id: string
  name: string
  isPrivate: boolean
  enabled: boolean
  triggers: unknown[]
  createdAt: string
  updatedAt: string
  userId?: string | null
}

export interface WorkflowListState {
  workflows: WorkflowSummary[]
  loading: boolean
  error: string | null
  triggering: Record<string, boolean>
  lastTriggerResult: Record<string, string>
  payloadDrafts: Record<string, string>
  payloadErrors: Record<string, string>
  dialogOpen: Record<string, boolean>
  fetchWorkflows: () => Promise<void>
  triggerWorkflow: (workflowId: string, payloadText?: string) => Promise<boolean>
  setDialogOpen: (workflowId: string, open: boolean) => void
  setPayloadDraft: (workflowId: string, value: string) => void
  addWorkflow: (workflow: WorkflowSummary) => void
}

export const useWorkflowListStore = create<WorkflowListState>((set, get) => ({
  workflows: [],
  loading: false,
  error: null,
  triggering: {},
  lastTriggerResult: {},
  payloadDrafts: {},
  payloadErrors: {},
  dialogOpen: {},
  fetchWorkflows: async () => {
    set({ loading: true, error: null })
    try {
      const response = await fetch('/api/workflow')
      if (response.status === 401) {
        set({ error: 'Please log in to view workflows.', workflows: [], loading: false })
        return
      }
      if (!response.ok) {
        set({ error: `Failed to load workflows (HTTP ${response.status}).`, loading: false })
        return
      }
      const data = await response.json() as { workflows: WorkflowSummary[] }
      set({ workflows: data.workflows, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load workflows.', loading: false })
    }
  },
  triggerWorkflow: async (workflowId: string, payloadText?: string): Promise<boolean> => {
    set((state) => ({
      triggering: { ...state.triggering, [workflowId]: true },
      lastTriggerResult: { ...state.lastTriggerResult, [workflowId]: '' },
      payloadErrors: { ...state.payloadErrors, [workflowId]: '' }
    }))
    try {
      let payloadBody: Record<string, unknown> | undefined = undefined
      if (payloadText !== undefined && payloadText.trim() !== '') {
        try {
          payloadBody = { payload: JSON.parse(payloadText) as unknown }
        } catch {
          set((state) => ({
            payloadErrors: { ...state.payloadErrors, [workflowId]: 'Invalid JSON payload.' }
          }))
          return false
        }
      }

      const headers = payloadBody === undefined ? undefined : { 'Content-Type': 'application/json' }
      const body = payloadBody === undefined ? undefined : JSON.stringify(payloadBody)
      const response = await fetch(`/api/workflow/${workflowId}/trigger`, {
        method: 'POST',
        headers,
        body
      })
      if (!response.ok) {
        const message = response.status === 403
          ? 'Forbidden'
          : `Failed (HTTP ${response.status})`
        set((state) => ({
          lastTriggerResult: { ...state.lastTriggerResult, [workflowId]: message }
        }))
        return false
      }
      set((state) => ({
        lastTriggerResult: { ...state.lastTriggerResult, [workflowId]: 'Triggered' }
      }))
      return true
    } catch (err) {
      set((state) => ({
        lastTriggerResult: {
          ...state.lastTriggerResult,
          [workflowId]: err instanceof Error ? err.message : 'Trigger failed'
        }
      }))
      return false
    } finally {
      set((state) => ({
        triggering: { ...state.triggering, [workflowId]: false }
      }))
    }
  },
  setDialogOpen: (workflowId, open) => {
    set((state) => ({
      dialogOpen: { ...state.dialogOpen, [workflowId]: open }
    }))
  },
  setPayloadDraft: (workflowId, value) => {
    set((state) => ({
      payloadDrafts: { ...state.payloadDrafts, [workflowId]: value },
      payloadErrors: state.payloadErrors[workflowId] === ''
        ? state.payloadErrors
        : { ...state.payloadErrors, [workflowId]: '' }
    }))
  },
  addWorkflow: (workflow) => {
    set((state) => ({
      workflows: [workflow, ...state.workflows]
    }))
  }
}))

export interface WorkflowDetailState {
  workflowId: string | null
  workflow: WorkflowMetaData | null
  definition: StateMachineDefinition | null
  loading: boolean
  error: string | null
  fetchDetail: (workflowId: string) => Promise<void>
  setWorkflow: (workflow: WorkflowMetaData, definition: StateMachineDefinition) => void
  setError: (message: string | null) => void
  clear: () => void
}

export const useWorkflowDetailStore = create<WorkflowDetailState>((set) => ({
  workflowId: null,
  workflow: null,
  definition: null,
  loading: false,
  error: null,
  fetchDetail: async (workflowId: string) => {
    set({ loading: true, error: null, workflowId })
    try {
      const response = await fetch(`/api/workflow/${workflowId}/actions`)
      if (response.status === 401) {
        set({ error: 'Please log in to view workflow details.', definition: null, workflow: null, loading: false })
        return
      }
      if (!response.ok) {
        set({ error: `Failed to load workflow actions (HTTP ${response.status}).`, loading: false })
        return
      }
      const data = await response.json() as { definition: StateMachineDefinition; workflow: WorkflowMetaData }
      set({ definition: data.definition, workflow: data.workflow, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load workflow actions.', loading: false })
    }
  },
  setWorkflow: (workflow, definition) => {
    set({ workflow, definition })
  },
  setError: (message) => {
    set({ error: message })
  },
  clear: () => {
    set({ workflowId: null, workflow: null, definition: null, loading: false, error: null })
  }
}))

export interface WorkflowInstance {
  workflowId: string
  instanceId: string
  firstJobId: string
  currentJobId?: string
  currentStateName?: string
  status: 'pending' | 'running' | 'failed' | 'completed'
  createdAt: number
  startedAt?: number
  completedAt?: number
  trigger?: unknown
}

export interface WorkflowInstancesState {
  workflowId: string | null
  instances: WorkflowInstance[]
  loading: boolean
  error: string | null
  fetchInstances: (workflowId: string) => Promise<void>
  setError: (message: string | null) => void
  clear: () => void
}

export const useWorkflowInstancesStore = create<WorkflowInstancesState>((set) => ({
  workflowId: null,
  instances: [],
  loading: false,
  error: null,
  fetchInstances: async (workflowId: string) => {
    set({ loading: true, error: null, workflowId })
    try {
      const response = await fetch(`/api/workflow/${workflowId}/instances`)
      if (response.status === 401) {
        set({ error: 'Please log in to view workflow instances.', instances: [], loading: false })
        return
      }
      if (!response.ok) {
        set({ error: `Failed to load workflow instances (HTTP ${response.status}).`, loading: false })
        return
      }
      const data = await response.json() as { instances: WorkflowInstance[] }
      set({ instances: data.instances, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load workflow instances.', loading: false })
    }
  },
  setError: (message) => {
    set({ error: message })
  },
  clear: () => {
    set({ workflowId: null, instances: [], loading: false, error: null })
  }
}))
