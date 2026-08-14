import { workflowCreateRequestSchema } from '@mudkipme/klinklang-domain'
import type { PrismaClient } from '@mudkipme/klinklang-prisma'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { loadAll } from 'js-yaml'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { Config } from '../lib/config.ts'
import { validateWorkflowCreatePayload } from '../lib/workflow-validation.ts'
import {
  createVersionedWorkflow,
  toWorkflowSnapshot,
  updateVersionedWorkflow
} from '../models/workflow-revision.ts'

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

  const { definition, triggers } = validation.data
  const user = workflowConfig.user === undefined
    ? null
    : await prisma.user.findUnique({ where: { name: workflowConfig.user } })
  let workflow = await prisma.workflow.findFirst({ where: { name: workflowConfig.name } })

  if (workflow === null) {
    workflow = await createVersionedWorkflow(prisma, {
      name: workflowConfig.name,
      isPrivate: workflowConfig.isPrivate,
      enabled: workflowConfig.enabled,
      triggers,
      definition
    }, user?.id ?? null, {
      changeKind: 'BOOTSTRAP'
    })
  } else if (!isDeepStrictEqual(workflow.definition, definition)) {
    workflow = await updateVersionedWorkflow(prisma, workflow, {
      ...toWorkflowSnapshot(workflow),
      definition
    }, {
      changeKind: 'BOOTSTRAP'
    })
  }

  if (user !== null && workflow.userId !== user.id) {
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: {
        userId: user.id
      }
    })
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
    loadAll(content, workflow => {
      workflows.push(workflow)
    })
    await Promise.all(workflows.map(async input => {
      await setupWorkflow(prisma, workflowConfigSchema.parse(input))
    }))
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  }
}
