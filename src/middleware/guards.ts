import type { FastifyReply, FastifyRequest } from 'fastify'

import { verifyAccessToken } from '../lib/access-token.ts'
import { forbiddenError, unauthorizedError } from '../lib/errors.ts'
import type { UserRole } from '../types.ts'

/**
 * Verifies the Bearer access token and decorates the request with the
 * authenticated user. Registered as an `onRequest` hook so authentication
 * failures take precedence over body parsing and validation errors.
 */
export const requireAuth = async (request: FastifyRequest, _reply: FastifyReply) => {
  const authorization = request.headers.authorization
  if (!authorization) throw unauthorizedError()

  const [scheme, token] = authorization.split(' ')
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) throw unauthorizedError()

  const payload = await verifyAccessToken(token)
  if (!payload) throw unauthorizedError()

  request.user = { id: payload.sub, role: payload.role }
}

/** Explicit role allow-list; no implicit hierarchy (`admin` is not implicitly allowed). */
export const requireRole =
  (...allowed: UserRole[]) =>
  async (request: FastifyRequest) => {
    const role = request.user?.role
    if (!role) throw unauthorizedError()
    if (!allowed.includes(role)) throw forbiddenError()
  }
