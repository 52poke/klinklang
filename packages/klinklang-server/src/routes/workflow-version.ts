import {
  workflowBadRequestResponseSchema,
  workflowDeleteResponseSchema,
  workflowDiffQuerySchema,
  workflowDiffResponseSchema,
  workflowDuplicateRequestSchema,
  workflowExportDocumentSchema,
  workflowIdParamsSchema,
  workflowImportRequestSchema,
  workflowMutationResponseSchema,
  workflowRevisionParamsSchema,
  workflowRevisionResponseSchema,
  workflowRevisionsResponseSchema,
  type WorkflowSnapshot
} from '@mudkipme/klinklang-domain'
import type { Workflow } from '@mudkipme/klinklang-prisma'
import type { FastifyPluginCallbackZod } from '@fastify/type-provider-zod'
import {
  forbiddenError,
  workflowConflictError,
  workflowNotFoundError,
  workflowRevisionNotFoundError
} from '../lib/errors.ts'
import { validateWorkflowCreateData } from '../lib/workflow-validation.ts'
import userMiddleware from '../middlewares/user.ts'
import { canCreateWorkflow, canManageWorkflow, canViewWorkflow } from '../models/workflow.ts'
import { toWorkflowMetadata } from '../models/workflow-data.ts'
import {
  deleteWorkflowInstanceHistory,
  hasActiveWorkflowInstances
} from '../models/workflow-instance-history.ts'
import {
  createVersionedWorkflow,
  diffWorkflowSnapshots,
  toWorkflowRevision,
  toWorkflowRevisionMetadata,
  toWorkflowSnapshot,
  updateVersionedWorkflow,
  WorkflowVersionConflictError
} from '../models/workflow-revision.ts'

const workflowVersionRoutes: FastifyPluginCallbackZod = (fastify) => {
  const { prisma } = fastify.diContainer.cradle

  const getWorkflow = async (workflowId: string): Promise<Workflow> => {
    const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } })
    if (workflow === null) {
      throw workflowNotFoundError()
    }
    return workflow
  }

  const notifyChanged = async (): Promise<void> => {
    await fastify.diContainer.cradle.notification.sendMessage({ type: 'WORKFLOW_EVENTBUS_UPDATE' })
  }

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:workflowId/revisions',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowIdParamsSchema,
      response: { 200: workflowRevisionsResponseSchema }
    },
    handler: async (request) => {
      const workflow = await getWorkflow(request.params.workflowId)
      if (!canViewWorkflow(workflow, request.user?.id)) throw forbiddenError()
      const revisions = await prisma.workflowRevision.findMany({
        where: { workflowId: workflow.id },
        orderBy: { revision: 'desc' }
      })
      return { revisions: revisions.map(toWorkflowRevisionMetadata) }
    }
  })

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:workflowId/revisions/diff',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowIdParamsSchema,
      querystring: workflowDiffQuerySchema,
      response: { 200: workflowDiffResponseSchema }
    },
    handler: async (request) => {
      const workflow = await getWorkflow(request.params.workflowId)
      if (!canViewWorkflow(workflow, request.user?.id)) throw forbiddenError()
      const records = await prisma.workflowRevision.findMany({
        where: {
          workflowId: workflow.id,
          revision: { in: Array.from(new Set([request.query.from, request.query.to])) }
        }
      })
      const from = records.find(record => record.revision === request.query.from)
      const to = records.find(record => record.revision === request.query.to)
      if (from === undefined || to === undefined) throw workflowRevisionNotFoundError()
      return {
        from: toWorkflowRevisionMetadata(from),
        to: toWorkflowRevisionMetadata(to),
        changes: diffWorkflowSnapshots(toWorkflowSnapshot(from), toWorkflowSnapshot(to))
      }
    }
  })

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:workflowId/revisions/:revision',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowRevisionParamsSchema,
      response: { 200: workflowRevisionResponseSchema }
    },
    handler: async (request) => {
      const workflow = await getWorkflow(request.params.workflowId)
      if (!canViewWorkflow(workflow, request.user?.id)) throw forbiddenError()
      const revision = await prisma.workflowRevision.findUnique({
        where: {
          workflowId_revision: {
            workflowId: workflow.id,
            revision: request.params.revision
          }
        }
      })
      if (revision === null) throw workflowRevisionNotFoundError()
      return { revision: toWorkflowRevision(revision) }
    }
  })

  fastify.route({
    method: 'POST',
    url: '/api/workflow/:workflowId/revisions/:revision/rollback',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowRevisionParamsSchema,
      response: { 200: workflowMutationResponseSchema, 400: workflowBadRequestResponseSchema }
    },
    handler: async (request, reply) => {
      const workflow = await getWorkflow(request.params.workflowId)
      if (!canManageWorkflow(workflow, request.user)) throw forbiddenError()
      const revision = await prisma.workflowRevision.findUnique({
        where: {
          workflowId_revision: {
            workflowId: workflow.id,
            revision: request.params.revision
          }
        }
      })
      if (revision === null) throw workflowRevisionNotFoundError()
      const validation = validateWorkflowCreateData(toWorkflowSnapshot(revision))
      if (validation.data === null) {
        await reply.code(400).send({ error: 'INVALID_WORKFLOW', issues: validation.issues })
        return
      }
      const updated = await updateVersionedWorkflow(prisma, workflow, validation.data, {
        changeKind: 'ROLLBACK',
        sourceRevision: revision.revision,
        createdById: request.user?.id
      }).catch((error: unknown) => {
        if (error instanceof WorkflowVersionConflictError) {
          throw workflowConflictError(error.message)
        }
        throw error
      })
      await notifyChanged()
      return { workflow: toWorkflowMetadata(updated) }
    }
  })

  fastify.route({
    method: 'POST',
    url: '/api/workflow/:workflowId/duplicate',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowIdParamsSchema,
      body: workflowDuplicateRequestSchema.optional(),
      response: { 200: workflowMutationResponseSchema }
    },
    handler: async (request) => {
      const source = await getWorkflow(request.params.workflowId)
      if (!canViewWorkflow(source, request.user?.id)) throw forbiddenError()
      if (!canCreateWorkflow(request.user)) throw forbiddenError()
      const snapshot: WorkflowSnapshot = {
        ...toWorkflowSnapshot(source),
        name: request.body?.name ?? `${source.name} (copy)`,
        enabled: false
      }
      const created = await createVersionedWorkflow(prisma, snapshot, request.user?.id ?? null, {
        changeKind: 'DUPLICATE',
        sourceWorkflowId: source.id,
        sourceRevision: source.currentRevision,
        createdById: request.user?.id
      })
      await notifyChanged()
      return { workflow: toWorkflowMetadata(created) }
    }
  })

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:workflowId/export',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowIdParamsSchema,
      response: { 200: workflowExportDocumentSchema }
    },
    handler: async (request, reply) => {
      const workflow = await getWorkflow(request.params.workflowId)
      if (!canViewWorkflow(workflow, request.user?.id)) throw forbiddenError()
      void reply.header('Content-Disposition', `attachment; filename="workflow-${workflow.id}.json"`)
      return { formatVersion: 1 as const, workflow: toWorkflowSnapshot(workflow) }
    }
  })

  fastify.route({
    method: 'POST',
    url: '/api/workflow/import',
    preHandler: userMiddleware(true),
    schema: {
      body: workflowImportRequestSchema,
      response: { 200: workflowMutationResponseSchema, 400: workflowBadRequestResponseSchema }
    },
    handler: async (request, reply) => {
      if (!canCreateWorkflow(request.user)) throw forbiddenError()
      const validation = validateWorkflowCreateData(request.body.workflow)
      if (validation.data === null) {
        await reply.code(400).send({ error: 'INVALID_WORKFLOW', issues: validation.issues })
        return
      }
      const created = await createVersionedWorkflow(prisma, validation.data, request.user?.id ?? null, {
        changeKind: 'IMPORT',
        createdById: request.user?.id
      })
      await notifyChanged()
      return { workflow: toWorkflowMetadata(created) }
    }
  })

  fastify.route({
    method: 'DELETE',
    url: '/api/workflow/:workflowId',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowIdParamsSchema,
      response: { 200: workflowDeleteResponseSchema }
    },
    handler: async (request) => {
      const workflow = await getWorkflow(request.params.workflowId)
      if (!canManageWorkflow(workflow, request.user)) throw forbiddenError()
      const { redis } = fastify.diContainer.cradle
      if (await hasActiveWorkflowInstances(redis, workflow.id)) {
        throw workflowConflictError('Workflow has active instances')
      }
      await prisma.workflow.delete({ where: { id: workflow.id } })
      await deleteWorkflowInstanceHistory(redis, workflow.id).catch((error: unknown) => {
        fastify.log.warn({ err: error, workflowId: workflow.id }, 'failed to remove workflow instance history')
      })
      await notifyChanged()
      return { deleted: true as const, workflowId: workflow.id }
    }
  })
}

export default workflowVersionRoutes
