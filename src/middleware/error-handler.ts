import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

import { AppError } from '../lib/errors.ts'
import { logger } from '../lib/logger.ts'
import { failureEnvelope } from '../lib/response.ts'
import { requestPath } from './request-context.ts'

const zodIssueDetails = (error: ZodError) =>
  error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)'
    return `${field}: ${issue.message}`
  })

const validationEntryDetails = (error: FastifyError) =>
  (error.validation ?? []).map((entry) => {
    const field = entry.instancePath.replace(/^\//, '').replaceAll('/', '.')
    return field.length > 0 ? `${field}: ${entry.message}` : (entry.message ?? '(root)')
  })

const sendFailure = (
  reply: FastifyReply,
  status: number,
  path: string,
  code: string,
  message: string,
  errorDetails?: unknown,
  error?: unknown,
) => {
  reply.code(status).send(
    failureEnvelope({
      path,
      code,
      message,
      errorDetails,
      error,
    }),
  )
}

/** Maps framework and application errors onto the common failure envelope. */
export const errorHandler = async (
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const path = requestPath(request)

  if (error instanceof ZodError) {
    sendFailure(
      reply,
      400,
      path,
      'VALIDATION_ERROR',
      'Validation failed',
      zodIssueDetails(error),
      error,
    )
    return
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    sendFailure(
      reply,
      400,
      path,
      'VALIDATION_ERROR',
      'Validation failed',
      validationEntryDetails(error),
      error,
    )
    return
  }

  // Fastify marks malformed JSON bodies as SyntaxError with statusCode 400.
  if (error instanceof SyntaxError && (error as FastifyError).statusCode === 400) {
    sendFailure(reply, 400, path, 'VALIDATION_ERROR', 'Validation failed', undefined, error)
    return
  }

  if (error instanceof AppError) {
    sendFailure(reply, error.status, path, error.code, error.message, error.details, error)
    return
  }

  logger.error({ err: error }, 'unhandled request error')
  sendFailure(reply, 500, path, 'INTERNAL_ERROR', 'Internal server error', undefined, error)
}

/** Unknown routes and methods return the envelope 404. */
export const notFoundHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  reply.code(404).send(
    failureEnvelope({
      path: requestPath(request),
      code: 'NOT_FOUND',
      message: 'Route not found',
    }),
  )
}
