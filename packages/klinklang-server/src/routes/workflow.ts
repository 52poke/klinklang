import type { Prisma } from '@mudkipme/klinklang-prisma'
import type { FastifyPluginCallback, FastifyRequest } from 'fastify'
import { forbiddenError, workflowNotFoundError } from '../lib/errors.ts'
import { parsePagination } from '../lib/pagination.ts'
import userMiddleware from '../middlewares/user.ts'
import type { StateMachineDefinition } from '../models/asl.ts'
import type { WorkflowTrigger } from '../models/workflow-type.ts'
import { canViewWorkflow, createInstanceWithWorkflow, getWorkflowInstances } from '../models/workflow.ts'
import { validateWorkflowCreatePayload, validateWorkflowUpdatePayload } from '../lib/workflow-validation.ts'

const workflowRoutes: FastifyPluginCallback = (fastify) => {
  const { prisma } = fastify.diContainer.cradle

  fastify.route({
    method: 'GET',
    url: '/api/workflow',
    preHandler: userMiddleware(true),
    handler: async (request: FastifyRequest<{ Querystring: { offset?: string; limit?: string } }>, reply) => {
      const { offset, limit } = parsePagination(request.query)
      const workflows = await prisma.workflow.findMany({
        skip: offset,
        take: limit,
        where: {
          OR: [
            { isPrivate: false },
            { userId: request.user?.id ?? null }
          ]
        }
      })
      await reply.send({
        workflows
      })
    }
  })

  fastify.route({
    method: 'POST',
    url: '/api/workflow',
    preHandler: userMiddleware(true),
    handler: async (request: FastifyRequest<{ Body: unknown }>, reply) => {
      const requesterGroups = request.user?.groups ?? []
      const canCreate = requesterGroups.includes('sysop') || requesterGroups.includes('bot')
      if (!canCreate) {
        throw forbiddenError()
      }

      const { data, issues } = validateWorkflowCreatePayload(request.body)
      if (data === null) {
        await reply.code(400).send({ error: 'INVALID_WORKFLOW', issues })
        return
      }

      const created = await prisma.workflow.create({
        data: {
          name: data.name,
          isPrivate: data.isPrivate,
          enabled: data.enabled,
          triggers: data.triggers as Prisma.InputJsonValue,
          definition: data.definition as unknown as Prisma.InputJsonValue,
          userId: request.user?.id ?? null
        }
      })

      await fastify.diContainer.cradle.notification.sendMessage({ type: 'WORKFLOW_EVENTBUS_UPDATE' })

      await reply.send({ workflow: created })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:workflowId/actions',
    preHandler: userMiddleware(true),
    handler: async (
      request: FastifyRequest<{ Querystring: { start: string; stop: string }; Params: { workflowId: string } }>
    ) => {
      const workflow = await prisma.workflow.findUnique({ where: { id: request.params.workflowId } })
      if (workflow === null) {
        throw workflowNotFoundError()
      }
      if (!canViewWorkflow(workflow, request.user?.id)) {
        throw forbiddenError()
      }
      const definition = workflow.definition as unknown as StateMachineDefinition
      return {
        definition,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          isPrivate: workflow.isPrivate,
          enabled: workflow.enabled,
          triggers: workflow.triggers,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
          userId: workflow.userId
        }
      }
    }
  })

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:workflowId/instances',
    preHandler: userMiddleware(true),
    handler: async (
      request: FastifyRequest<{
        Querystring: { offset?: string; limit?: string; start?: string; stop?: string }
        Params: { workflowId: string }
      }>
    ) => {
      const workflow = await prisma.workflow.findUnique({ where: { id: request.params.workflowId } })
      if (workflow === null) {
        throw workflowNotFoundError()
      }
      if (!canViewWorkflow(workflow, request.user?.id)) {
        throw forbiddenError()
      }
      const { offset, limit } = parsePagination({
        offset: request.query.offset ?? request.query.start,
        limit: request.query.limit ?? request.query.stop
      })
      const instances = await getWorkflowInstances(workflow, offset, limit)
      return {
        instances
      }
    }
  })

  fastify.route({
    method: 'POST',
    url: '/api/workflow/:workflowId/trigger',
    preHandler: userMiddleware(true),
    handler: async (request: FastifyRequest<{ Params: { workflowId: string }; Body?: { payload?: unknown } }>) => {
      const workflow = await prisma.workflow.findUnique({
        where: { id: request.params.workflowId }
      })
      if (workflow === null) {
        throw workflowNotFoundError()
      }

      const supportsManualTrigger = (workflow.triggers as WorkflowTrigger[])
        .find(trigger => trigger.type === 'TRIGGER_MANUAL')
      if (supportsManualTrigger === undefined) {
        throw forbiddenError()
      }

      const requesterGroups = request.user?.groups ?? []
      const canTriggerManually = requesterGroups.includes('sysop') || requesterGroups.includes('bot')
      if (!canTriggerManually) {
        throw forbiddenError()
      }

      if (workflow.isPrivate) {
        if (workflow.userId === null || workflow.userId !== request.user?.id) {
          throw forbiddenError()
        }
      }

      if (!workflow.enabled) {
        throw forbiddenError()
      }

      const instance = await createInstanceWithWorkflow(workflow, supportsManualTrigger, request.body?.payload)

      return {
        workflow,
        instance
      }
    }
  })

  fastify.route({
    method: 'PUT',
    url: '/api/workflow/:workflowId',
    preHandler: userMiddleware(true),
    handler: async (request: FastifyRequest<{ Params: { workflowId: string }; Body: unknown }>, reply) => {
      const workflow = await prisma.workflow.findUnique({
        where: { id: request.params.workflowId },
        include: { user: true }
      })
      if (workflow === null) {
        throw workflowNotFoundError()
      }

      const requester = request.user
      const isOwner = requester?.id !== undefined && workflow.userId === requester.id
      const isSysop = (requester?.groups ?? []).includes('sysop')
      if (workflow.isPrivate) {
        if (!isOwner) {
          throw forbiddenError()
        }
      } else if (!isOwner && !isSysop) {
        throw forbiddenError()
      }

      const { data, issues } = validateWorkflowUpdatePayload(request.body, {
        name: workflow.name,
        isPrivate: workflow.isPrivate,
        enabled: workflow.enabled,
        triggers: workflow.triggers as WorkflowTrigger[],
        definition: workflow.definition as unknown as StateMachineDefinition
      })
      if (data === null) {
        await reply.code(400).send({ error: 'INVALID_WORKFLOW', issues })
        return
      }

      const updated = await prisma.workflow.update({
        where: { id: workflow.id },
        data: {
          name: data.name,
          isPrivate: data.isPrivate,
          enabled: data.enabled,
          triggers: data.triggers as Prisma.InputJsonValue,
          definition: data.definition as unknown as Prisma.InputJsonValue
        }
      })

      await fastify.diContainer.cradle.notification.sendMessage({ type: 'WORKFLOW_EVENTBUS_UPDATE' })

      await reply.send({ workflow: updated })
    }
  })
}

export default workflowRoutes
