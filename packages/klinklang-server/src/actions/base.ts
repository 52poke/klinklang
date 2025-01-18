import { diContainer } from '@fastify/awilix'
import type { User, Workflow } from '@mudkipme/klinklang-prisma'
import type { Job } from 'bullmq'
import WorkflowInstance from '../models/workflow-instance.ts'
import type { ActionJobData, ActionJobResult, Actions } from './interfaces.ts'

export type WorkerType<T extends Actions> = new(job: Job<ActionJobData<T>, ActionJobResult<T>>) => ActionWorker<T>

export abstract class ActionWorker<T extends Actions> {
  protected readonly jobId?: string
  protected readonly input: T['input']
  protected readonly workflowId: string
  protected readonly instanceId: string
  protected readonly actionId: string
  #workflow?: Workflow & { user: User | null } | null

  public constructor (job: Job<ActionJobData<T>, ActionJobResult<T>>) {
    this.jobId = job.id
    this.input = job.data.input
    this.workflowId = job.data.workflowId
    this.instanceId = job.data.instanceId
    this.actionId = job.data.actionId
  }

  protected async getInstance (): Promise<WorkflowInstance | null> {
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

  public async handleJob (): Promise<ActionJobResult<T>> {
    const instance = await this.getInstance()
    if (instance === null) {
      throw new Error('WORKFLOW_INSTANCE_NOT_FOUND')
    }
    await instance.started(this.jobId)
    const output = await this.process()
    await instance.update(this.actionId, output)
    const nextJob = await instance.createNextJob(this.actionId)
    if (nextJob === null) {
      await instance.complete()
    }
    return {
      output,
      nextJobId: nextJob?.id
    }
  }

  public abstract process (): Promise<T['output']> | T['output']
}
