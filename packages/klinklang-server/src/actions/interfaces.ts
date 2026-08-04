export interface ActionContract {
  input: unknown
  output: unknown
}

export interface ActionJobData<T extends ActionContract> {
  actionType: string
  input: T['input']
  instanceId: string
  workflowId: string
  stateName: string
}

export interface ActionJobResult<T extends ActionContract> {
  output: T['output']
  nextJobId?: string
}
