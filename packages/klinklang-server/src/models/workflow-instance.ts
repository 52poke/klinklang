import { diContainer } from '@fastify/awilix'
import type { Action } from '@mudkipme/klinklang-prisma'
import type { Job } from 'bullmq'
import { randomUUID } from 'node:crypto'
import type { ActionJobData, ActionJobResult, Actions } from '../actions/interfaces.js'
import { buildJobData } from './action.js'
import type { WorkflowTrigger } from './workflow-type.js'

export interface WorkflowInstanceData {
  workflowId: string
  instanceId: string
  firstJobId: string
  currentJobId?: string
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
  public status: 'pending' | 'running' | 'failed' | 'completed'
  public readonly createdAt: Date
  public startedAt?: Date
  public completedAt?: Date
  public context: Record<string, unknown>
  public readonly trigger?: WorkflowTrigger

  private constructor (data: WorkflowInstanceData) {
    this.workflowId = data.workflowId
    this.instanceId = data.instanceId
    this.firstJobId = data.firstJobId
    this.currentJobId = data.currentJobId
    this.status = data.status
    this.createdAt = new Date(data.createdAt)
    this.startedAt = data.startedAt !== undefined ? new Date(data.startedAt) : undefined
    this.completedAt = data.completedAt !== undefined ? new Date(data.completedAt) : undefined
    this.context = data.context
  }

  public toJSON (): WorkflowInstanceData {
    return {
      workflowId: this.workflowId,
      instanceId: this.instanceId,
      firstJobId: this.firstJobId,
      currentJobId: this.currentJobId,
      status: this.status,
      createdAt: this.createdAt.getTime(),
      startedAt: this.startedAt !== undefined ? this.startedAt.getTime() : undefined,
      completedAt: this.completedAt !== undefined ? this.completedAt.getTime() : undefined,
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

  public async started (jobId?: string): Promise<void> {
    this.currentJobId = jobId
    this.status = 'running'
    await this.save()
  }

  public async update (currentActionId: string, output: Actions['output']): Promise<void> {
    const { prisma } = diContainer.cradle
    const action = await prisma.action.findUnique({ where: { id: currentActionId } })
    if (action === null) {
      throw new Error('ERR_ACTION_NOT_FOUND')
    }
    if (action.outputContext !== null && action.outputContext !== '') {
      this.context[action.outputContext] = output
    } else {
      this.context.payload = output
    }
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
    currentActionId: string
  ): Promise<Job<ActionJobData<T>, ActionJobResult<T>> | null> {
    const { prisma, queue } = diContainer.cradle
    const action = await prisma.action.findUnique({ where: { id: currentActionId }, include: { nextAction: true } })
    if (action === null) {
      throw new Error('ERR_ACTION_NOT_FOUND')
    }
    const { nextAction } = action
    if (nextAction === null) {
      return null
    }

    const jobData = buildJobData(nextAction, this.instanceId, this.context)
    const jobId = randomUUID()
    const job = await queue.add(nextAction.actionType, jobData, { jobId })
    return job
  }

  public static async create (
    headAction: Action,
    trigger?: WorkflowTrigger,
    payload?: unknown
  ): Promise<WorkflowInstance> {
    const instanceId = randomUUID()
    const context = { payload }
    const jobData = buildJobData(headAction, instanceId, context)
    const jobId = randomUUID()
    await diContainer.cradle.queue.add(headAction.actionType, jobData, { jobId })

    const data: WorkflowInstanceData = {
      workflowId: headAction.workflowId,
      instanceId,
      firstJobId: jobId,
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
    return instance !== null ? new WorkflowInstance(JSON.parse(instance) as WorkflowInstanceData) : null
  }
}

export default WorkflowInstance
