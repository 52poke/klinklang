import { diContainer } from '@fastify/awilix'
import type { User, Workflow } from '@mudkipme/klinklang-prisma'
import type { Job } from 'bullmq'
import type { ZodType } from 'zod'
import type WorkflowInstance from '../models/workflow-instance.ts'
import type { ActionContract, ActionJobData, ActionJobResult } from './interfaces.ts'

export type WorkerType<T extends ActionContract> = new(job: Job<ActionJobData<T>, ActionJobResult<T>>) => ActionWorker<T>

export abstract class ActionWorker<T extends ActionContract> {
  protected readonly jobId?: string
  protected readonly input: T['input']
  protected readonly workflowId: string
  protected readonly instanceId: string
  protected readonly stateName: string
  #workflow?: Workflow & { user: User | null } | null

  public constructor (job: Job<ActionJobData<T>, ActionJobResult<T>>) {
    this.jobId = job.id
    this.input = job.data.input
    this.workflowId = job.data.workflowId
    this.instanceId = job.data.instanceId
    this.stateName = job.data.stateName
  }

  protected async getInstance (): Promise<WorkflowInstance | null> {
    const { default: WorkflowInstance } = await import('../models/workflow-instance.ts')
    return await WorkflowInstance.getInstance(this.workflowId, this.instanceId)
  }

  protected async getWorkflow (): Promise<Workflow & { user: User | null } | null> {
    if (this.#workflow !== undefined && this.#workflow !== null) {
      return this.#workflow
    }
    const workflow = await diContainer.cradle.prisma.workflow.findUnique({
      where: { id: this.workflowId },
      include: { user: true }
    })
    this.#workflow = workflow
    return workflow
  }

  public async handleJob (outputSchema: ZodType): Promise<ActionJobResult<T>> {
    const instance = await this.getInstance()
    if (instance === null) {
      throw new Error('WORKFLOW_INSTANCE_NOT_FOUND')
    }
    await instance.started(this.jobId, this.stateName)
    const output = outputSchema.parse(await this.process()) as T['output']
    const latest = await this.getInstance()
    if (latest === null) {
      throw new Error('WORKFLOW_INSTANCE_NOT_FOUND')
    }
    if (latest.status === 'cancelled') {
      return { output }
    }
    await latest.update(this.jobId, this.stateName, output)
    const updated = await this.getInstance()
    if (updated === null) {
      throw new Error('WORKFLOW_INSTANCE_NOT_FOUND')
    }
    if (updated.status === 'cancelled') {
      return { output }
    }
    const transition = await updated.createNextJob<T>(this.stateName)
    if (transition.status === 'completed') {
      await updated.complete()
    } else if (transition.status === 'failed') {
      await updated.fail(transition.reason)
    }
    return {
      output,
      nextJobId: transition.status === 'scheduled' ? transition.job.id : undefined
    }
  }

  protected async log (
    message: string,
    level: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): Promise<void> {
    const instance = await this.getInstance()
    await instance?.appendStepLog(this.jobId, level, message)
  }

  public abstract process (): Promise<T['output']> | T['output']
}
