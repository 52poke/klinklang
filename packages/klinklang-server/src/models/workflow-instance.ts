import { diContainer } from '@fastify/awilix'
import type { Workflow } from '@mudkipme/klinklang-prisma'
import type { Job } from 'bullmq'
import { randomUUID } from 'node:crypto'
import type { ActionJobData, ActionJobResult, Actions } from '../actions/interfaces.ts'
import type { StateMachineDefinition } from './asl.ts'
import { applyStateOutput, buildStateInput, getState, getTaskState, resolveNextTaskState } from './asl.ts'
import type { WorkflowTrigger } from './workflow-type.ts'

export interface WorkflowInstanceData {
  workflowId: string
  instanceId: string
  firstJobId: string
  currentJobId?: string
  currentStateName?: string
  status: 'pending' | 'running' | 'failed' | 'completed'
  createdAt: number
  startedAt?: number
  completedAt?: number
  trigger?: WorkflowTrigger
  context: Record<string, unknown>
}

class WorkflowInstance {
  public readonly workflowId: string
  public readonly instanceId: string
  public firstJobId: string
  public currentJobId?: string
  public currentStateName?: string
  public status: 'pending' | 'running' | 'failed' | 'completed'
  public readonly createdAt: Date
  public startedAt?: Date
  public completedAt?: Date
  public context: Record<string, unknown>
  public readonly trigger?: WorkflowTrigger
  #definition?: StateMachineDefinition

  private constructor (data: WorkflowInstanceData) {
    this.workflowId = data.workflowId
    this.instanceId = data.instanceId
    this.firstJobId = data.firstJobId
    this.currentJobId = data.currentJobId
    this.currentStateName = data.currentStateName
    this.status = data.status
    this.createdAt = new Date(data.createdAt)
    this.startedAt = data.startedAt === undefined ? undefined : new Date(data.startedAt)
    this.completedAt = data.completedAt === undefined ? undefined : new Date(data.completedAt)
    this.context = data.context
    this.trigger = data.trigger
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
      trigger: this.trigger,
      context: this.context
    }
  }

  public async save (): Promise<void> {
    const { redis } = diContainer.cradle
    const data = this.toJSON()
    await Promise.all([
      redis.set(`workflow-instance:${this.workflowId}:${this.instanceId}`, JSON.stringify(data)),
      redis.zadd(`workflow-instances:${this.workflowId}`, Date.now(), this.instanceId)
    ])
  }

  public async started (jobId?: string, stateName?: string): Promise<void> {
    this.currentJobId = jobId
    this.currentStateName = stateName ?? this.currentStateName
    this.status = 'running'
    await this.save()
  }

  public async update (currentStateName: string, output: Actions['output']): Promise<void> {
    const definition = await this.getDefinition()
    const state = getTaskState(definition, currentStateName)
    this.context = applyStateOutput(state, this.context, output)
    await this.save()
  }

  public async fail (): Promise<void> {
    this.completedAt = new Date()
    this.status = 'failed'
    await this.save()
  }

  public async complete (): Promise<void> {
    this.completedAt = new Date()
    this.status = 'completed'
    await this.save()
  }

  public async createNextJob<T extends Actions> (
    currentStateName: string
  ): Promise<Job<ActionJobData<T>, ActionJobResult<T>> | null> {
    const { queue } = diContainer.cradle
    const definition = await this.getDefinition()
    const nextTask = resolveNextTaskState(definition, currentStateName, this.context)
    if (nextTask === null) {
      return null
    }
    const nextStateName = nextTask.name
    const nextState = nextTask.state
    const jobData: ActionJobData<T> = {
      actionType: nextState.Resource as T['actionType'],
      input: buildStateInput(nextState, this.context) as T['input'],
      workflowId: this.workflowId,
      instanceId: this.instanceId,
      stateName: nextStateName
    }
    const jobId = randomUUID()
    const job = await queue.add(nextState.Resource, jobData, { jobId })
    return job
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
    const definition = definitionValue as StateMachineDefinition
    const context = { payload }
    const startStateName = definition.StartAt
    const startState = getState(definition, startStateName)
    const startTask = startState.Type === 'Task'
      ? { name: startStateName, state: startState }
      : resolveNextTaskState(definition, startStateName, context)
    if (startTask === null) {
      throw new Error('ERR_WORKFLOW_START_STATE_NOT_FOUND')
    }
    const instanceId = randomUUID()
    const jobData: ActionJobData<Actions> = {
      actionType: startTask.state.Resource as Actions['actionType'],
      input: buildStateInput(startTask.state, context) as Actions['input'],
      workflowId: workflow.id,
      instanceId,
      stateName: startTask.name
    }
    const jobId = randomUUID()
    await diContainer.cradle.queue.add(startTask.state.Resource, jobData, { jobId })

    const data: WorkflowInstanceData = {
      workflowId: workflow.id,
      instanceId,
      firstJobId: jobId,
      currentStateName: startTask.name,
      status: 'pending',
      createdAt: Date.now(),
      trigger,
      context
    }
    const instance = new WorkflowInstance(data)
    await instance.save()
    return instance
  }

  public static async getInstancesOfWorkflow (
    workflowId: string,
    start: number,
    stop: number
  ): Promise<WorkflowInstance[]> {
    const { redis } = diContainer.cradle
    const instanceIds = await redis.zrevrange(`workflow-instances:${workflowId}`, start, stop)
    if (instanceIds.length === 0) {
      return []
    }
    const instances = await redis.mget(...instanceIds.map(id => `workflow-instance:${workflowId}:${id}`))
    return instances.filter(instance => instance !== null).map(data =>
      new WorkflowInstance(JSON.parse(data) as WorkflowInstanceData)
    )
  }

  public static async getInstance (workflowId: string, instanceId: string): Promise<WorkflowInstance | null> {
    const { redis } = diContainer.cradle
    const instance = await redis.get(`workflow-instance:${workflowId}:${instanceId}`)
    if (instance === null) {
      return null
    }
    return new WorkflowInstance(JSON.parse(instance) as WorkflowInstanceData)
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
    const definition = definitionValue as unknown as StateMachineDefinition
    this.#definition = definition
    return definition
  }
}

export default WorkflowInstance
