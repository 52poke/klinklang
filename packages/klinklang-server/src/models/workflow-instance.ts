import { diContainer } from '@fastify/awilix'
import {
  stateMachineDefinitionSchema,
  workflowInstanceSchema,
  type StateMachineDefinition,
  type WorkflowInstance as WorkflowInstanceData,
  type WorkflowStepExecution,
  type WorkflowTrigger
} from '@mudkipme/klinklang-domain'
import type { Workflow } from '@mudkipme/klinklang-prisma'
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { ActionContract, ActionJobData } from '../actions/interfaces.ts'
import { getActionJobOptions } from '../actions/register.ts'
import {
  applyPassState,
  applyStateOutput,
  buildStateInput,
  getTaskState,
  interpretStateTransition
} from './asl.ts'
import {
  createQueuedStep,
  getFailStateReason,
  type WorkflowTransition
} from './workflow-execution.ts'

export type { WorkflowInstanceData }

const workflowInstanceStorageSchema = workflowInstanceSchema.extend({
  definition: stateMachineDefinitionSchema.optional()
})
type WorkflowInstanceStorageData = z.infer<typeof workflowInstanceStorageSchema>

class WorkflowInstance {
  public readonly workflowId: string
  public readonly instanceId: string
  public firstJobId: string
  public currentJobId?: string
  public currentStateName?: string
  public status: 'pending' | 'running' | 'failed' | 'completed' | 'cancelled'
  public readonly createdAt: Date
  public startedAt?: Date
  public completedAt?: Date
  public failureReason?: string
  public context: Record<string, unknown>
  public steps: WorkflowStepExecution[]
  public readonly trigger?: WorkflowTrigger
  #definition?: StateMachineDefinition

  private constructor (data: WorkflowInstanceStorageData) {
    this.workflowId = data.workflowId
    this.instanceId = data.instanceId
    this.firstJobId = data.firstJobId
    this.currentJobId = data.currentJobId
    this.currentStateName = data.currentStateName
    this.status = data.status
    this.createdAt = new Date(data.createdAt)
    this.startedAt = data.startedAt === undefined ? undefined : new Date(data.startedAt)
    this.completedAt = data.completedAt === undefined ? undefined : new Date(data.completedAt)
    this.failureReason = data.failureReason
    this.context = data.context
    this.steps = data.steps
    this.trigger = data.trigger
    this.#definition = data.definition
  }

  public toJSON (): WorkflowInstanceData {
    return {
      workflowId: this.workflowId,
      instanceId: this.instanceId,
      firstJobId: this.firstJobId,
      currentJobId: this.currentJobId,
      currentStateName: this.currentStateName,
      status: this.status,
      createdAt: this.createdAt.getTime(),
      startedAt: this.startedAt === undefined ? undefined : this.startedAt.getTime(),
      completedAt: this.completedAt === undefined ? undefined : this.completedAt.getTime(),
      failureReason: this.failureReason,
      trigger: this.trigger,
      context: this.context,
      steps: this.steps
    }
  }

  public async save (): Promise<void> {
    const { config, redis } = diContainer.cradle
    const workflowConfig = config.get('workflow')
    const retentionSeconds = Math.max(1, workflowConfig.instanceRetentionSeconds)
    const historyLimit = Math.max(1, workflowConfig.instanceHistoryLimit)
    const instanceKey = `workflow-instance:${this.workflowId}:${this.instanceId}`
    const indexKey = `workflow-instances:${this.workflowId}`
    const now = Date.now()
    const data: WorkflowInstanceStorageData = {
      ...this.toJSON(),
      definition: this.#definition
    }
    await redis.zadd(indexKey, now, this.instanceId)
    await Promise.all([
      redis.set(instanceKey, JSON.stringify(data), 'EX', retentionSeconds),
      redis.zremrangebyscore(indexKey, '-inf', now - retentionSeconds * 1000),
      redis.zremrangebyrank(indexKey, 0, -historyLimit - 1),
      redis.expire(indexKey, retentionSeconds)
    ])
  }

  public async started (jobId?: string, stateName?: string): Promise<void> {
    if (this.status === 'cancelled') {
      throw new Error('WORKFLOW_INSTANCE_CANCELLED')
    }
    const now = Date.now()
    this.currentJobId = jobId
    this.currentStateName = stateName ?? this.currentStateName
    this.status = 'running'
    this.startedAt ??= new Date(now)
    if (jobId !== undefined) {
      const step = this.steps.find(candidate => candidate.jobId === jobId)
      if (step !== undefined) {
        step.status = 'running'
        step.startedAt ??= now
        step.attempts += 1
        step.logs.push({
          timestamp: now,
          level: 'info',
          message: `Attempt ${step.attempts} started.`
        })
      }
    }
    await this.save()
  }

  public async update (
    jobId: string | undefined,
    currentStateName: string,
    output: ActionContract['output']
  ): Promise<void> {
    if (this.status === 'cancelled') {
      return
    }
    const definition = await this.getDefinition()
    const state = getTaskState(definition, currentStateName)
    this.context = applyStateOutput(state, this.context, output)
    if (jobId !== undefined) {
      const step = this.steps.find(candidate => candidate.jobId === jobId)
      if (step !== undefined) {
        const now = Date.now()
        step.status = 'completed'
        step.output = output
        step.completedAt = now
        step.durationMs = Math.max(0, now - (step.startedAt ?? step.queuedAt))
        step.failureReason = undefined
        step.logs.push({ timestamp: now, level: 'info', message: 'Step completed.' })
      }
    }
    await this.save()
  }

  public async fail (reason = 'Workflow execution failed.'): Promise<void> {
    if (this.status === 'cancelled') {
      return
    }
    this.completedAt = new Date()
    this.status = 'failed'
    this.failureReason = reason
    await this.save()
  }

  public async complete (): Promise<void> {
    if (this.status === 'cancelled') {
      return
    }
    this.completedAt = new Date()
    this.status = 'completed'
    this.failureReason = undefined
    await this.save()
  }

  public async recordJobFailure (jobId: string, reason: string, willRetry: boolean): Promise<void> {
    if (this.status === 'cancelled') {
      return
    }
    const step = this.steps.find(candidate => candidate.jobId === jobId)
    const now = Date.now()
    if (step !== undefined) {
      step.failureReason = reason
      step.logs.push({ timestamp: now, level: 'error', message: reason })
      if (willRetry) {
        step.status = 'queued'
        step.logs.push({ timestamp: now, level: 'warn', message: 'Retry scheduled by queue policy.' })
      } else {
        step.status = 'failed'
        step.completedAt = now
        step.durationMs = Math.max(0, now - (step.startedAt ?? step.queuedAt))
      }
    }
    if (willRetry) {
      this.status = 'pending'
      await this.save()
      return
    }
    await this.fail(reason)
  }

  public async appendStepLog (
    jobId: string | undefined,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string
  ): Promise<void> {
    if (jobId === undefined) {
      return
    }
    const step = this.steps.find(candidate => candidate.jobId === jobId)
    if (step === undefined) {
      return
    }
    step.logs.push({ timestamp: Date.now(), level, message })
    await this.save()
  }

  public async createNextJob<T extends ActionContract> (
    currentStateName: string
  ): Promise<WorkflowTransition<T>> {
    const { queue } = diContainer.cradle
    const definition = await this.getDefinition()
    const transition = interpretStateTransition(definition, {
      afterStateName: currentStateName,
      context: this.context,
      applyPassState
    })
    this.context = transition.context
    if (transition.status === 'task') {
      const jobData: ActionJobData<T> = {
        actionType: transition.state.Resource,
        input: buildStateInput(transition.state, this.context),
        workflowId: this.workflowId,
        instanceId: this.instanceId,
        stateName: transition.name
      }
      const jobId = randomUUID()
      this.steps.push(createQueuedStep(jobId, jobData))
      this.currentJobId = jobId
      this.currentStateName = transition.name
      this.status = 'pending'
      await this.save()
      try {
        const job = await queue.add(
          transition.state.Resource,
          jobData,
          getActionJobOptions(transition.state.Resource, jobId)
        ) as Extract<WorkflowTransition<T>, { status: 'scheduled' }>['job']
        return { status: 'scheduled', job }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        await this.recordJobFailure(jobId, reason, false)
        throw error
      }
    }
    if (transition.traversed.some(name => definition.States[name].Type === 'Pass')) {
      await this.save()
    }
    this.currentStateName = transition.name
    if (transition.status === 'failed') {
      return { status: 'failed', reason: getFailStateReason(transition.state) }
    }
    return { status: 'completed' }
  }

  public static async create (
    workflow: Workflow,
    trigger?: WorkflowTrigger,
    payload?: unknown
  ): Promise<WorkflowInstance> {
    const definitionValue = workflow.definition
    if (definitionValue === null) {
      throw new Error('ERR_WORKFLOW_DEFINITION_NOT_FOUND')
    }
    const definition = stateMachineDefinitionSchema.parse(definitionValue)
    const transition = interpretStateTransition(definition, {
      context: { payload },
      applyPassState
    })
    const instanceId = randomUUID()
    const jobId = randomUUID()
    const isTerminal = transition.status !== 'task'
    const jobData: ActionJobData<ActionContract> | undefined = transition.status === 'task'
      ? {
          actionType: transition.state.Resource,
          input: buildStateInput(transition.state, transition.context),
          workflowId: workflow.id,
          instanceId,
          stateName: transition.name
        }
      : undefined
    const failureReason = transition.status === 'failed' ? getFailStateReason(transition.state) : undefined
    const data: WorkflowInstanceStorageData = {
      workflowId: workflow.id,
      instanceId,
      firstJobId: jobId,
      currentJobId: jobData === undefined ? undefined : jobId,
      currentStateName: transition.name,
      status: transition.status === 'task' ? 'pending' : transition.status,
      createdAt: Date.now(),
      completedAt: isTerminal ? Date.now() : undefined,
      failureReason,
      trigger,
      context: transition.context,
      steps: jobData === undefined ? [] : [createQueuedStep(jobId, jobData)],
      definition
    }
    const instance = new WorkflowInstance(data)
    await instance.save()

    if (transition.status !== 'task') {
      return instance
    }

    try {
      await diContainer.cradle.queue.add(
        transition.state.Resource,
        jobData,
        getActionJobOptions(transition.state.Resource, jobId)
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await instance.recordJobFailure(jobId, reason, false)
      throw error
    }
    return instance
  }

  public async cancel (reason = 'Cancelled by user.'): Promise<void> {
    if (this.status === 'completed' || this.status === 'failed' || this.status === 'cancelled') {
      throw new Error('WORKFLOW_INSTANCE_NOT_CANCELLABLE')
    }
    const now = Date.now()
    this.status = 'cancelled'
    this.failureReason = reason
    this.completedAt = new Date(now)
    const step = this.currentJobId === undefined
      ? undefined
      : this.steps.find(candidate => candidate.jobId === this.currentJobId)
    if (step !== undefined && (step.status === 'queued' || step.status === 'running')) {
      step.status = 'cancelled'
      step.failureReason = reason
      step.completedAt = now
      step.durationMs = Math.max(0, now - (step.startedAt ?? step.queuedAt))
      step.logs.push({ timestamp: now, level: 'warn', message: reason })
    }
    await this.save()

    if (this.currentJobId === undefined) {
      return
    }
    const job = await diContainer.cradle.queue.getJob(this.currentJobId)
    if (job === undefined) {
      return
    }
    const jobState = await job.getState()
    if (jobState !== 'active') {
      await job.remove()
      if (step !== undefined) {
        step.logs.push({ timestamp: Date.now(), level: 'info', message: 'Queued job removed.' })
        await this.save()
      }
    } else if (step !== undefined) {
      step.logs.push({
        timestamp: Date.now(),
        level: 'warn',
        message: 'Active work could not be preempted; subsequent transitions are blocked.'
      })
      await this.save()
    }
  }

  public async retry (): Promise<void> {
    if (this.status !== 'failed' || this.currentStateName === undefined) {
      throw new Error('WORKFLOW_INSTANCE_NOT_RETRYABLE')
    }
    const definition = await this.getDefinition()
    const state = definition.States[this.currentStateName]
    if (state.Type !== 'Task') {
      throw new Error('WORKFLOW_INSTANCE_NOT_RETRYABLE')
    }
    const failedStep = this.steps.findLast(candidate =>
      candidate.stateName === this.currentStateName && candidate.status === 'failed'
    )
    const jobId = randomUUID()
    const jobData: ActionJobData<ActionContract> = {
      actionType: state.Resource,
      input: failedStep?.input ?? buildStateInput(state, this.context),
      workflowId: this.workflowId,
      instanceId: this.instanceId,
      stateName: this.currentStateName
    }
    this.steps.push(createQueuedStep(jobId, jobData, failedStep?.jobId))
    this.currentJobId = jobId
    this.status = 'pending'
    this.failureReason = undefined
    this.completedAt = undefined
    await this.save()
    try {
      await diContainer.cradle.queue.add(
        state.Resource,
        jobData,
        getActionJobOptions(state.Resource, jobId)
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await this.recordJobFailure(jobId, reason, false)
      throw error
    }
  }

  public static async getInstancesOfWorkflow (
    workflowId: string,
    offset: number,
    limit: number
  ): Promise<WorkflowInstance[]> {
    const { redis } = diContainer.cradle
    const indexKey = `workflow-instances:${workflowId}`
    const start = Math.max(0, offset)
    const stop = start + Math.max(1, limit) - 1
    const instanceIds = await redis.zrevrange(indexKey, start, stop)
    if (instanceIds.length === 0) {
      return []
    }
    const instances = await redis.mget(...instanceIds.map(id => `workflow-instance:${workflowId}:${id}`))
    const missingIds = instanceIds.filter((_, index) => instances[index] === null)
    if (missingIds.length > 0) {
      await redis.zrem(indexKey, ...missingIds)
    }
    return instances.filter(instance => instance !== null).map(data => {
      const parsed: unknown = JSON.parse(data)
      return new WorkflowInstance(workflowInstanceStorageSchema.parse(parsed))
    })
  }

  public static async getInstance (workflowId: string, instanceId: string): Promise<WorkflowInstance | null> {
    const { redis } = diContainer.cradle
    const instance = await redis.get(`workflow-instance:${workflowId}:${instanceId}`)
    if (instance === null) {
      return null
    }
    const parsed: unknown = JSON.parse(instance)
    return new WorkflowInstance(workflowInstanceStorageSchema.parse(parsed))
  }

  private async getDefinition (): Promise<StateMachineDefinition> {
    if (this.#definition !== undefined) {
      return this.#definition
    }
    const { prisma } = diContainer.cradle
    const workflow = await prisma.workflow.findUnique({ where: { id: this.workflowId } })
    if (workflow === null) {
      throw new Error('ERR_WORKFLOW_NOT_FOUND')
    }
    const definitionValue = workflow.definition
    if (definitionValue === null) {
      throw new Error('ERR_WORKFLOW_DEFINITION_NOT_FOUND')
    }
    const definition = stateMachineDefinitionSchema.parse(definitionValue)
    this.#definition = definition
    return definition
  }
}

export default WorkflowInstance
