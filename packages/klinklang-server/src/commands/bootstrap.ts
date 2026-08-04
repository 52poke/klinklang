import { workflowCreateRequestSchema } from '@mudkipme/klinklang-domain'
import type { Prisma, PrismaClient } from '@mudkipme/klinklang-prisma'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import yaml from 'js-yaml'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Config } from '../lib/config.ts'
import { validateWorkflowCreatePayload } from '../lib/workflow-validation.ts'

const workflowConfigSchema = workflowCreateRequestSchema.extend({ user: z.string().optional() })
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>

export async function setupWorkflow (prisma: PrismaClient, workflowConfig: WorkflowConfig): Promise<void> {
  const validation = validateWorkflowCreatePayload({
    name: workflowConfig.name,
    isPrivate: workflowConfig.isPrivate,
    enabled: workflowConfig.enabled,
    triggers: workflowConfig.triggers,
    definition: workflowConfig.definition
  })
  if (validation.data === null) {
    throw new Error(`Invalid bootstrap workflow "${workflowConfig.name}": ${validation.issues.join('; ')}`)
  }

  let workflow = await prisma.workflow.findFirst({ where: { name: workflowConfig.name } })

  const { definition, triggers } = validation.data

  if (workflow === null) {
    workflow = await prisma.workflow.create({
      data: {
        name: workflowConfig.name,
        isPrivate: workflowConfig.isPrivate,
        enabled: workflowConfig.enabled,
        triggers: triggers as Prisma.InputJsonValue,
        definition: definition as unknown as Prisma.InputJsonValue
      }
    })
  } else {
    workflow = await prisma.workflow.update({
      where: { id: workflow.id },
      data: {
        definition: definition as unknown as Prisma.InputJsonValue
      }
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
    const workflows: unknown[] = []
    yaml.loadAll(content, workflow => workflows.push(workflow))
    await Promise.all(workflows.map(async input => {
      await setupWorkflow(prisma, workflowConfigSchema.parse(input))
    }))
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  }
}
