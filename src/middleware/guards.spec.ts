import { createHmac } from 'node:crypto'

import { fastify } from 'fastify'
import { describe, expect, it } from 'vitest'

import { env } from '../config/env.ts'
import { errorHandler } from './error-handler.ts'
import { requireAuth, requireRole } from './guards.ts'
import { registerRequestContext } from './request-context.ts'
import type { UserRole } from '../types.ts'

// Hand-rolled HS256 signer so tests can control exp and the signing secret.
const signTestToken = (options: {
  sub: string
  role: UserRole
  expiresInSec?: number
  secret?: string
}) => {
  const now = Math.floor(Date.now() / 1000)
  const secret = options.secret ?? env.JWT_SECRET
  const base64Url = (data: string | Buffer) => Buffer.from(data).toString('base64url')
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64Url(
    JSON.stringify({
      sub: options.sub,
      role: options.role,
      iat: now - 10,
      exp: now + (options.expiresInSec ?? 60),
    }),
  )
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

const createGuardApp = async () => {
  const app = fastify()
  registerRequestContext(app)
  app.setErrorHandler(errorHandler)
  app.get('/probe', { onRequest: requireAuth }, async (request) => ({
    userId: request.user?.id,
    userRole: request.user?.role,
  }))
  app.get('/agents-only', { onRequest: [requireAuth, requireRole('agent')] }, async () => 'ok')
  app.get(
    '/agents-and-admins',
    { onRequest: [requireAuth, requireRole('agent', 'admin')] },
    async () => 'ok',
  )
  app.get('/role-without-auth', { onRequest: requireRole('admin') }, async () => 'ok')
  return app
}

const authedGet = async (path: string, token: string) => {
  const app = await createGuardApp()
  return app.inject({ method: 'GET', url: path, headers: { Authorization: `Bearer ${token}` } })
}

describe('requireAuth', () => {
  it('rejects a missing Authorization header with the common envelope', async () => {
    const app = await createGuardApp()
    const response = await app.inject({ method: 'GET', url: '/probe' })
    const body = await response.json()

    expect(response.statusCode).toBe(401)
    expect(body).toMatchObject({
      path: '/probe',
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      errors: { message: ['Authentication required'] },
    })
    expect(response.headers['x-request-id']).toBeTruthy()
  })

  it('rejects a non-Bearer scheme', async () => {
    const token = signTestToken({ sub: 'u1', role: 'user' })
    const app = await createGuardApp()
    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { Authorization: `Token ${token}` },
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects a malformed token', async () => {
    const response = await authedGet('/probe', 'not-a-jwt')
    expect(response.statusCode).toBe(401)
  })

  it('rejects an expired token', async () => {
    const response = await authedGet(
      '/probe',
      signTestToken({ sub: 'u1', role: 'user', expiresInSec: -60 }),
    )
    expect(response.statusCode).toBe(401)
  })

  it('rejects a token signed with a different secret', async () => {
    const response = await authedGet(
      '/probe',
      signTestToken({ sub: 'u1', role: 'user', secret: 'y'.repeat(48) }),
    )
    expect(response.statusCode).toBe(401)
  })

  it('rejects a forged alg:none token', async () => {
    const forged = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: 'u1', role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString('base64url')}.`
    const response = await authedGet('/probe', forged)
    expect(response.statusCode).toBe(401)
  })

  it('passes a valid token and exposes the user to the handler', async () => {
    const response = await authedGet('/probe', signTestToken({ sub: 'user-42', role: 'admin' }))
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ userId: 'user-42', userRole: 'admin' })
  })
})

describe('requireRole', () => {
  it('passes when the role is in the allow-list', async () => {
    const response = await authedGet('/agents-only', signTestToken({ sub: 'u1', role: 'agent' }))
    expect(response.statusCode).toBe(200)
  })

  it('rejects a role outside the allow-list with 403 FORBIDDEN', async () => {
    const response = await authedGet('/agents-only', signTestToken({ sub: 'u1', role: 'user' }))
    const body = await response.json()
    expect(response.statusCode).toBe(403)
    expect(body).toMatchObject({ code: 'FORBIDDEN', message: 'Insufficient permissions' })
  })

  it('does not grant admin implicitly: requireRole("agent") rejects admin', async () => {
    const response = await authedGet('/agents-only', signTestToken({ sub: 'u1', role: 'admin' }))
    expect(response.statusCode).toBe(403)
  })

  it('passes both declared roles in a multi-role allow-list and rejects the rest', async () => {
    const agent = await authedGet('/agents-and-admins', signTestToken({ sub: 'u1', role: 'agent' }))
    const admin = await authedGet('/agents-and-admins', signTestToken({ sub: 'u2', role: 'admin' }))
    const user = await authedGet('/agents-and-admins', signTestToken({ sub: 'u3', role: 'user' }))
    expect(agent.statusCode).toBe(200)
    expect(admin.statusCode).toBe(200)
    expect(user.statusCode).toBe(403)
  })

  it('returns 401, not 403, when mounted without requireAuth', async () => {
    const app = await createGuardApp()
    const response = await app.inject({ method: 'GET', url: '/role-without-auth' })
    expect(response.statusCode).toBe(401)
  })
})
