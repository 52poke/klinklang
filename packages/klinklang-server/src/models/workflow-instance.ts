import { diContainer } from '@fastify/awilix'
import {
  stateMachineDefinitionSchema,
  workflowInstanceSchema,
  type StateMachineDefinition,
  type WorkflowInstance as WorkflowInstanceData,
  type WorkflowTrigger
} from '@mudkipme/klinklang-domain'
import type { Workflow } from '@mudkipme/klinklang-prisma'
import type { Job } from 'bullmq'
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { ActionContract, ActionJobData, ActionJobResult } from '../actions/interfaces.ts'
import { getActionJobOptions } from '../actions/register.ts'
import {
  applyPassState,
  applyStateOutput,
  buildStateInput,
  getTaskState,
  interpretStateTransition
} from './asl.ts'

export type { WorkflowInstanceData }

const workflowInstanceStorageSchema = workflowInstanceSchema.extend({
  definition: stateMachineDefinitionSchema.optional()
})
type WorkflowInstanceStorageData = z.infer<typeof workflowInstanceStorageSchema>

export type WorkflowTransition<T extends ActionContract> =
  | {
    status: 'scheduled'
    job: Job<ActionJobData<T>, ActionJobResult<T>>
  }
  | {
    status: 'completed' | 'failed'
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
    this.context = data.context
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
      trigger: this.trigger,
      context: this.context
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
    this.currentJobId = jobId
    this.currentStateName = stateName ?? this.currentStateName
    this.status = 'running'
    await this.save()
  }

  public async update (currentStateName: string, output: ActionContract['output']): Promise<void> {
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
    if (transition.traversed.some(name => definition.States[name].Type === 'Pass')) {
      await this.save()
    }
    if (transition.status === 'task') {
      const jobData: ActionJobData<T> = {
        actionType: transition.state.Resource,
        input: buildStateInput(transition.state, this.context),
        workflowId: this.workflowId,
        instanceId: this.instanceId,
        stateName: transition.name
      }
      const jobId = randomUUID()
      const job = await queue.add(
        transition.state.Resource,
        jobData,
        getActionJobOptions(transition.state.Resource, jobId)
      ) as Job<
        ActionJobData<T>,
        ActionJobResult<T>
      >
      return { status: 'scheduled', job }
    }
    return { status: transition.status }
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
    const data: WorkflowInstanceStorageData = {
      workflowId: workflow.id,
      instanceId,
      firstJobId: jobId,
      currentStateName: transition.name,
      status: transition.status === 'task' ? 'pending' : transition.status,
      createdAt: Date.now(),
      completedAt: isTerminal ? Date.now() : undefined,
      trigger,
      context: transition.context,
      definition
    }
    const instance = new WorkflowInstance(data)
    await instance.save()

    if (transition.status !== 'task') {
      return instance
    }

    const jobData: ActionJobData<ActionContract> = {
      actionType: transition.state.Resource,
      input: buildStateInput(transition.state, transition.context),
      workflowId: workflow.id,
      instanceId,
      stateName: transition.name
    }

    try {
      await diContainer.cradle.queue.add(
        transition.state.Resource,
        jobData,
        getActionJobOptions(transition.state.Resource, jobId)
      )
    } catch (error) {
      await instance.fail()
      throw error
    }
    return instance
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
