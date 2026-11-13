import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { logger } from '../lib/logger.ts'

/** Request pathname without the query string, matching the envelope `path` field. */
export const requestPath = (request: FastifyRequest): string =>
  request.url.split('?')[0] ?? request.url

/**
 * Reuses an inbound `x-request-id` of at most 128 characters; otherwise
 * generates a UUID. Applied as Fastify's `genReqId`.
 */
export const generateRequestId = (raw: IncomingMessage): string => {
  const provided = raw.headers['x-request-id']
  const value = (Array.isArray(provided) ? provided[0] : provided) ?? ''
  return value.length > 0 && value.length <= 128 ? value : randomUUID()
}

/**
 * Minimal structural type so both the typed application instance and plain
 * test instances can register the hooks.
 */
type RequestContextApp = {
  addHook(
    name: 'onRequest',
    hook: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void,
  ): unknown
  addHook(
    name: 'onResponse',
    hook: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void,
  ): unknown
}

/** Echoes the request ID and logs request completion with the existing fields. */
export const registerRequestContext = (app: RequestContextApp) => {
  app.addHook('onRequest', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header('x-request-id', reply.request.id)
  })

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info(
      {
        durationMs: Math.round(reply.elapsedTime),
        method: request.method,
        path: requestPath(request),
        requestId: request.id,
        status: reply.statusCode,
      },
      'request completed',
    )
  })
}
