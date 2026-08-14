import type { WorkflowStepExecution } from '@mudkipme/klinklang-domain'
import type { Job } from 'bullmq'
import type { ActionContract, ActionJobData, ActionJobResult } from '../actions/interfaces.ts'

export type WorkflowTransition<T extends ActionContract> =
  | { status: 'scheduled'; job: Job<ActionJobData<T>, ActionJobResult<T>> }
  | { status: 'completed' }
  | { status: 'failed'; reason: string }

export function createQueuedStep<T extends ActionContract> (
  jobId: string,
  jobData: ActionJobData<T>,
  retryOfJobId?: string
): WorkflowStepExecution {
  const queuedAt = Date.now()
  return {
    jobId,
    stateName: jobData.stateName,
    actionType: jobData.actionType,
    status: 'queued',
    input: jobData.input,
    attempts: 0,
    queuedAt,
    retryOfJobId,
    logs: [{ timestamp: queuedAt, level: 'info', message: 'Step queued.' }]
  }
}

export function getFailStateReason (state: { Error?: string; Cause?: string }): string {
  return state.Cause ?? state.Error ?? 'Workflow entered a Fail state.'
}
