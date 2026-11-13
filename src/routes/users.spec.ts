import { describe, expect, it } from 'vitest'

import { signAccessToken } from '../lib/access-token.ts'
import { hashPassword, verifyPassword } from '../lib/password.ts'
import { MemoryUserRepository, makeUser } from '../repositories/fakes.ts'
import { createApp } from '../main.ts'

const buildApp = async () => {
  const userRepository = new MemoryUserRepository()
  const app = await createApp({ userRepository })
  const admin = await userRepository.insert({
    username: 'admin',
    passwordHash: await hashPassword('admin-password'),
    displayName: 'Administrator',
    role: 'admin',
    status: 'active',
  })
  const adminToken = await signAccessToken({ sub: admin.id, role: 'admin' })
  return { app, userRepository, admin, adminToken }
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })
const jsonHeaders = { 'content-type': 'application/json' }

describe('user routes — authorization', () => {
  it('rejects unauthenticated requests', async () => {
    const { app } = await buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/users' })
    expect(response.statusCode).toBe(401)
    expect((await response.json()).code).toBe('UNAUTHORIZED')
  })

  it('rejects non-admin requests with 403', async () => {
    const { app } = await buildApp()
    const userToken = await signAccessToken({ sub: 'someone', role: 'user' })
    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: authed(userToken),
    })
    expect(response.statusCode).toBe(403)
    expect((await response.json()).code).toBe('FORBIDDEN')
  })
})

describe('POST /api/users', () => {
  it('creates a user and returns it in the envelope', async () => {
    const { app, adminToken, userRepository } = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ username: 'bob', password: 'bob-password-1', role: 'agent' }),
    })
    const body = await response.json()

    expect(response.statusCode).toBe(200)
    expect(body.data).toMatchObject({ username: 'bob', role: 'agent', status: 'active' })
    expect(body.data).not.toHaveProperty('passwordHash')

    const stored = await userRepository.findByUsername('bob')
    await expect(verifyPassword('bob-password-1', stored!.passwordHash)).resolves.toBe(true)
  })

  it('rejects a duplicate username with 409', async () => {
    const { app, adminToken } = await buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ username: 'bob', password: 'bob-password-1' }),
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ username: 'bob', password: 'another-password-1' }),
    })
    expect(response.statusCode).toBe(409)
    expect((await response.json()).code).toBe('USERNAME_TAKEN')
  })

  it('rejects invalid input with 400', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ username: 'bad name!', password: 'short' }),
    })
    expect(response.statusCode).toBe(400)
    expect((await response.json()).code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/users', () => {
  it('returns paginated results with meta', async () => {
    const userRepository = new MemoryUserRepository([
      makeUser({ username: 'alice', role: 'admin' }),
      makeUser({ username: 'bob', role: 'user' }),
      makeUser({ username: 'carol', role: 'user' }),
    ])
    const app = await createApp({ userRepository })
    const token = await signAccessToken({ sub: 'actor', role: 'admin' })

    const response = await app.inject({
      method: 'GET',
      url: '/api/users?page=1&pageSize=2',
      headers: authed(token),
    })
    const body = await response.json()

    expect(response.statusCode).toBe(200)
    expect(body.data).toHaveLength(2)
    expect(body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 })
  })

  it('returns an empty list with zeroed meta when nothing matches', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/users?role=agent',
      headers: authed(adminToken),
    })
    const body = await response.json()

    expect(response.statusCode).toBe(200)
    expect(body.data).toEqual([])
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  })
})

describe('GET /api/users/:id', () => {
  it('returns a user', async () => {
    const { app, adminToken, admin } = await buildApp()
    const response = await app.inject({
      method: 'GET',
      url: `/api/users/${admin.id}`,
      headers: authed(adminToken),
    })
    expect(response.statusCode).toBe(200)
    expect((await response.json()).data.id).toBe(admin.id)
  })

  it('returns 404 for a missing user', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/missing-id',
      headers: authed(adminToken),
    })
    expect(response.statusCode).toBe(404)
    expect((await response.json()).code).toBe('USER_NOT_FOUND')
  })
})

describe('PATCH /api/users/:id', () => {
  it('updates a user', async () => {
    const { app, adminToken } = await buildApp()
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ username: 'bob', password: 'bob-password-1' }),
    })
    const created = (await createResponse.json()).data

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/${created.id}`,
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ role: 'agent', status: 'disabled' }),
    })
    expect(response.statusCode).toBe(200)
    expect((await response.json()).data).toMatchObject({ role: 'agent', status: 'disabled' })
  })

  it('forbids self role change', async () => {
    const { app, adminToken, admin } = await buildApp()
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/${admin.id}`,
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ role: 'user' }),
    })
    expect(response.statusCode).toBe(403)
    expect((await response.json()).code).toBe('SELF_MODIFICATION_FORBIDDEN')
  })

  it('rejects an empty body with 400', async () => {
    const { app, adminToken, admin } = await buildApp()
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/${admin.id}`,
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({}),
    })
    expect(response.statusCode).toBe(400)
    expect((await response.json()).code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/users/:id/reset-password', () => {
  it('resets the password and returns a bare envelope', async () => {
    const { app, adminToken, userRepository } = await buildApp()
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ username: 'bob', password: 'old-password-1' }),
    })
    const created = (await createResponse.json()).data

    const response = await app.inject({
      method: 'POST',
      url: `/api/users/${created.id}/reset-password`,
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ password: 'new-password-2' }),
    })
    const body = await response.json()

    expect(response.statusCode).toBe(200)
    expect('data' in body).toBe(false)

    const stored = await userRepository.findById(created.id)
    await expect(verifyPassword('new-password-2', stored!.passwordHash)).resolves.toBe(true)
    await expect(verifyPassword('old-password-1', stored!.passwordHash)).resolves.toBe(false)
  })

  it('returns 404 for a missing user', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/users/missing-id/reset-password',
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ password: 'new-password-2' }),
    })
    expect(response.statusCode).toBe(404)
    expect((await response.json()).code).toBe('USER_NOT_FOUND')
  })
})
