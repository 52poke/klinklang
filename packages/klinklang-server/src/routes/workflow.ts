import {
  workflowCreateRequestSchema,
  workflowDetailResponseSchema,
  workflowIdParamsSchema,
  workflowInstanceParamsSchema,
  workflowInstanceResponseSchema,
  workflowInstancesQuerySchema,
  workflowInstancesResponseSchema,
  workflowListQuerySchema,
  workflowListResponseSchema,
  workflowMutationResponseSchema,
  workflowTriggerRequestSchema,
  workflowTriggerResponseSchema,
  workflowUpdateRequestSchema,
  workflowBadRequestResponseSchema
} from '@mudkipme/klinklang-domain'
import type { Prisma } from '@mudkipme/klinklang-prisma'
import type { FastifyPluginCallbackZod } from '@fastify/type-provider-zod'
import {
  forbiddenError,
  workflowInstanceConflictError,
  workflowInstanceNotFoundError,
  workflowNotFoundError
} from '../lib/errors.ts'
import userMiddleware from '../middlewares/user.ts'
import { canViewWorkflow, createInstanceWithWorkflow, getWorkflowInstances } from '../models/workflow.ts'
import { parseWorkflowDefinition, parseWorkflowTriggers, toWorkflowMetadata } from '../models/workflow-data.ts'
import WorkflowInstance from '../models/workflow-instance.ts'
import { validateWorkflowCreateData, validateWorkflowUpdateData } from '../lib/workflow-validation.ts'

const workflowRoutes: FastifyPluginCallbackZod = (fastify) => {
  const { prisma } = fastify.diContainer.cradle

  fastify.route({
    method: 'GET',
    url: '/api/workflow',
    preHandler: userMiddleware(true),
    schema: {
      querystring: workflowListQuerySchema,
      response: { 200: workflowListResponseSchema }
    },
    handler: async (request) => {
      const { offset, limit } = request.query
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
      return {
        workflows: workflows.map(toWorkflowMetadata)
      }
    }
  })

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:workflowId/instances/:instanceId',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowInstanceParamsSchema,
      response: { 200: workflowInstanceResponseSchema }
    },
    handler: async (request) => {
      const workflow = await prisma.workflow.findUnique({ where: { id: request.params.workflowId } })
      if (workflow === null) throw workflowNotFoundError()
      if (!canViewWorkflow(workflow, request.user?.id)) throw forbiddenError()
      const instance = await WorkflowInstance.getInstance(workflow.id, request.params.instanceId)
      if (instance === null) throw workflowInstanceNotFoundError()
      return { instance: instance.toJSON() }
    }
  })

  fastify.route({
    method: 'POST',
    url: '/api/workflow/:workflowId/instances/:instanceId/retry',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowInstanceParamsSchema,
      response: { 200: workflowInstanceResponseSchema }
    },
    handler: async (request) => {
      const workflow = await prisma.workflow.findUnique({ where: { id: request.params.workflowId } })
      if (workflow === null) throw workflowNotFoundError()
      const isOwner = request.user?.id !== undefined && workflow.userId === request.user.id
      const isSysop = (request.user?.groups ?? []).includes('sysop')
      if (!isOwner && (workflow.isPrivate || !isSysop)) throw forbiddenError()
      const instance = await WorkflowInstance.getInstance(workflow.id, request.params.instanceId)
      if (instance === null) throw workflowInstanceNotFoundError()
      try {
        await instance.retry()
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('WORKFLOW_INSTANCE_NOT_RETRYABLE')) {
          throw workflowInstanceConflictError(error.message)
        }
        throw error
      }
      return { instance: instance.toJSON() }
    }
  })

  fastify.route({
    method: 'POST',
    url: '/api/workflow/:workflowId/instances/:instanceId/cancel',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowInstanceParamsSchema,
      response: { 200: workflowInstanceResponseSchema }
    },
    handler: async (request) => {
      const workflow = await prisma.workflow.findUnique({ where: { id: request.params.workflowId } })
      if (workflow === null) throw workflowNotFoundError()
      const isOwner = request.user?.id !== undefined && workflow.userId === request.user.id
      const isSysop = (request.user?.groups ?? []).includes('sysop')
      if (!isOwner && (workflow.isPrivate || !isSysop)) throw forbiddenError()
      const instance = await WorkflowInstance.getInstance(workflow.id, request.params.instanceId)
      if (instance === null) throw workflowInstanceNotFoundError()
      try {
        await instance.cancel()
      } catch (error) {
        if (error instanceof Error && error.message === 'WORKFLOW_INSTANCE_NOT_CANCELLABLE') {
          throw workflowInstanceConflictError(error.message)
        }
        throw error
      }
      return { instance: instance.toJSON() }
    }
  })

  fastify.route({
    method: 'POST',
    url: '/api/workflow',
    preHandler: userMiddleware(true),
    schema: {
      body: workflowCreateRequestSchema,
      response: { 200: workflowMutationResponseSchema, 400: workflowBadRequestResponseSchema }
    },
    handler: async (request, reply) => {
      const requesterGroups = request.user?.groups ?? []
      const canCreate = requesterGroups.includes('sysop') || requesterGroups.includes('bot')
      if (!canCreate) {
        throw forbiddenError()
      }

      const { data, issues } = validateWorkflowCreateData(request.body)
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

      return { workflow: toWorkflowMetadata(created) }
    }
  })

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:workflowId/actions',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowIdParamsSchema,
      response: { 200: workflowDetailResponseSchema }
    },
    handler: async (request) => {
      const workflow = await prisma.workflow.findUnique({ where: { id: request.params.workflowId } })
      if (workflow === null) {
        throw workflowNotFoundError()
      }
      if (!canViewWorkflow(workflow, request.user?.id)) {
        throw forbiddenError()
      }
      const definition = parseWorkflowDefinition(workflow)
      return {
        definition,
        workflow: toWorkflowMetadata(workflow)
      }
    }
  })

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:workflowId/instances',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowIdParamsSchema,
      querystring: workflowInstancesQuerySchema,
      response: { 200: workflowInstancesResponseSchema }
    },
    handler: async (request) => {
      const workflow = await prisma.workflow.findUnique({ where: { id: request.params.workflowId } })
      if (workflow === null) {
        throw workflowNotFoundError()
      }
      if (!canViewWorkflow(workflow, request.user?.id)) {
        throw forbiddenError()
      }
      const offset = request.query.offset ?? request.query.start ?? 0
      const limit = request.query.limit ?? request.query.stop ?? 20
      const instances = await getWorkflowInstances(workflow, offset, limit)
      return {
        instances: instances.map(instance => instance.toJSON())
      }
    }
  })

  fastify.route({
    method: 'POST',
    url: '/api/workflow/:workflowId/trigger',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowIdParamsSchema,
      body: workflowTriggerRequestSchema.optional(),
      response: { 200: workflowTriggerResponseSchema }
    },
    handler: async (request) => {
      const workflow = await prisma.workflow.findUnique({
        where: { id: request.params.workflowId }
      })
      if (workflow === null) {
        throw workflowNotFoundError()
      }

      const supportsManualTrigger = parseWorkflowTriggers(workflow)
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
        workflow: toWorkflowMetadata(workflow),
        instance: instance.toJSON()
      }
    }
  })

  fastify.route({
    method: 'PUT',
    url: '/api/workflow/:workflowId',
    preHandler: userMiddleware(true),
    schema: {
      params: workflowIdParamsSchema,
      body: workflowUpdateRequestSchema,
      response: { 200: workflowMutationResponseSchema, 400: workflowBadRequestResponseSchema }
    },
    handler: async (request, reply) => {
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

      const { data, issues } = validateWorkflowUpdateData(request.body, {
        name: workflow.name,
        isPrivate: workflow.isPrivate,
        enabled: workflow.enabled,
        triggers: parseWorkflowTriggers(workflow),
        definition: parseWorkflowDefinition(workflow)
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

      return { workflow: toWorkflowMetadata(updated) }
    }
  })
}

export default workflowRoutes
