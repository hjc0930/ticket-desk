import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../main.ts'
import { AppError } from '../lib/errors.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('error responses', () => {
  it('returns the common failure envelope for a known application error', async () => {
    const app = await createApp()
    app.get('/known-error', async () => {
      throw new AppError(400, 'SOME_CODE', 'Invalid request', ['field: is wrong'])
    })

    const response = await app.inject({
      method: 'GET',
      url: '/known-error',
      headers: { 'x-request-id': 'test-request-id' },
    })
    const body = await response.json()

    expect(response.statusCode).toBe(400)
    expect(body).toMatchObject({
      path: '/known-error',
      message: 'Invalid request',
      code: 'SOME_CODE',
      errors: { message: ['field: is wrong'] },
    })
    expect(typeof body.date).toBe('string')
    expect(response.headers['x-request-id']).toBe('test-request-id')
  })

  it('does not expose unexpected error details in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = await createApp()
    app.get('/unexpected-error', async () => {
      throw new Error('database password must stay private')
    })

    const response = await app.inject({ method: 'GET', url: '/unexpected-error' })
    const body = await response.json()

    expect(response.statusCode).toBe(500)
    expect(body).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    })
    expect(JSON.stringify(body)).not.toContain('database password')
    expect(body.errors.stack).toBeUndefined()
  })

  it('includes the stack for unexpected errors outside production', async () => {
    const app = await createApp()
    app.get('/unexpected-error', async () => {
      throw new Error('debug-only detail')
    })

    const response = await app.inject({ method: 'GET', url: '/unexpected-error' })
    const body = await response.json()

    expect(response.statusCode).toBe(500)
    expect(typeof body.errors.stack).toBe('string')
  })
})
