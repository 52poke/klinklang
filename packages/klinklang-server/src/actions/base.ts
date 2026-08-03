import { diContainer } from '@fastify/awilix'
import type { User, Workflow } from '@mudkipme/klinklang-prisma'
import type { Job } from 'bullmq'
import type { ZodType } from 'zod'
import WorkflowInstance from '../models/workflow-instance.ts'
import type { ActionJobData, ActionJobResult, Actions } from './interfaces.ts'

export type WorkerType<T extends Actions> = new(job: Job<ActionJobData<T>, ActionJobResult<T>>) => ActionWorker<T>

export abstract class ActionWorker<T extends Actions> {
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
    await instance.update(this.stateName, output)
    const transition = await instance.createNextJob<T>(this.stateName)
    if (transition.status === 'completed') {
      await instance.complete()
    } else if (transition.status === 'failed') {
      await instance.fail()
    }
    return {
      output,
      nextJobId: transition.status === 'scheduled' ? transition.job.id : undefined
    }
  }

  public abstract process (): Promise<T['output']> | T['output']
}
