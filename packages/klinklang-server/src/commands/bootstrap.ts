import type { Prisma, PrismaClient } from '@mudkipme/klinklang-prisma'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import yaml from 'js-yaml'
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Config } from '../lib/config.ts'
import type { WorkflowTrigger } from '../models/workflow-type.ts'

export interface WorkflowConfig {
  name: string
  isPrivate: boolean
  enabled: boolean
  user?: string
  triggers: WorkflowTrigger[]
  actions: Array<Omit<Prisma.ActionCreateInput, 'isHead'>>
}

export async function setupWorkflow (prisma: PrismaClient, workflowConfig: WorkflowConfig): Promise<void> {
  let workflow = await prisma.workflow.findFirst({ where: { name: workflowConfig.name } })

  if (workflow === null) {
    const actions: Prisma.ActionCreateInput[] = []

    for (const [index, actionConfig] of workflowConfig.actions.entries()) {
      actions.push({
        ...actionConfig,
        isHead: index === 0,
        id: randomUUID()
      })
      if (index > 0) {
        actions[index - 1].nextAction = {
          connect: { id: actions[index].id }
        }
      }
    }

    workflow = await prisma.workflow.create({
      data: {
        name: workflowConfig.name,
        isPrivate: workflowConfig.isPrivate,
        enabled: workflowConfig.enabled,
        triggers: workflowConfig.triggers as Prisma.InputJsonValue,
        actions: {
          create: actions
        }
      },
      include: { actions: true }
    })
  }

  if (workflowConfig.user !== undefined) {
    const user = await prisma.user.findUnique({ where: { name: workflowConfig.user } })
    if (user !== null) {
      await prisma.workflow.update({
        where: { id: workflow.id },
        data: {
          userId: user.id
        }
      })
    }
  }
}

export default async function bootstrap ({ config, prisma }: { config: Config; prisma: PrismaClient }): Promise<void> {
  try {
    const workspaceRoot = await findWorkspaceDir(process.cwd())
    const filename = join(workspaceRoot ?? '.', config.get('app').bootstrap)
    const stats = await stat(filename)
    if (!stats.isFile()) {
      return
    }

    const content = await readFile(filename, { encoding: 'utf-8' })
    const workflows = yaml.loadAll(content) as WorkflowConfig[]
    for (const workflowConfig of workflows) {
      await setupWorkflow(prisma, workflowConfig)
    }
  } catch (e) {
    console.log(e)
  }
}
