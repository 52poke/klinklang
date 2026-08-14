import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

interface ValidationIssue {
  instancePath: string
  message?: string
}

function formatValidationIssue (issue: ValidationIssue): string {
  const path = issue.instancePath.slice(1).replaceAll('/', '.')
  const message = issue.message ?? 'Invalid value'
  return path.length === 0 ? message : `${path}: ${message}`
}

export function httpErrorHandler (
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
): unknown {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return reply.code(400).send({
      error: 'INVALID_REQUEST',
      issues: error.validation.map(formatValidationIssue)
    })
  }

  if (error.statusCode === 400) {
    return reply.code(400).send({
      error: 'INVALID_REQUEST',
      issues: [error.message]
    })
  }

  return reply.send(error)
}
