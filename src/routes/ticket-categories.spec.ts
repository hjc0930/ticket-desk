import { describe, expect, it } from 'vitest'

import { signAccessToken } from '../lib/access-token.ts'
import { MemoryTicketCategoryRepository, makeTicketCategory } from '../repositories/fakes.ts'
import { createApp } from '../main.ts'

const buildApp = async () => {
  const ticketCategoryRepository = new MemoryTicketCategoryRepository([
    makeTicketCategory({ name: 'Account Issues' }),
  ])
  const app = await createApp({ ticketCategoryRepository })
  const adminToken = await signAccessToken({ sub: 'admin-1', role: 'admin' })
  const userToken = await signAccessToken({ sub: 'user-1', role: 'user' })
  return { app, ticketCategoryRepository, adminToken, userToken }
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })
const jsonHeaders = { 'content-type': 'application/json' }

describe('ticket category routes — authorization', () => {
  it('requires authentication', async () => {
    const { app } = await buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/ticket-categories' })
    expect(response.statusCode).toBe(401)
  })

  it('rejects non-admin writes with 403', async () => {
    const { app, userToken } = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/ticket-categories',
      headers: { ...authed(userToken), ...jsonHeaders },
      payload: JSON.stringify({ name: 'New Category' }),
    })
    expect(response.statusCode).toBe(403)
  })

  it('allows any authenticated user to read', async () => {
    const { app, userToken } = await buildApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/ticket-categories',
      headers: authed(userToken),
    })
    expect(response.statusCode).toBe(200)
  })
})

describe('POST /api/ticket-categories', () => {
  it('creates a category', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/ticket-categories',
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ name: 'Hardware Failures' }),
    })
    const body = await response.json()
    expect(response.statusCode).toBe(200)
    expect(body.data).toMatchObject({ name: 'Hardware Failures', enabled: true })
  })

  it('rejects a duplicate name', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/ticket-categories',
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ name: 'Account Issues' }),
    })
    expect(response.statusCode).toBe(409)
    expect((await response.json()).code).toBe('CATEGORY_NAME_TAKEN')
  })
})

describe('GET /api/ticket-categories', () => {
  it('returns paginated results with meta', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/ticket-categories?page=1&pageSize=10',
      headers: authed(adminToken),
    })
    const body = await response.json()
    expect(response.statusCode).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.meta).toMatchObject({ page: 1, pageSize: 10, total: 1, totalPages: 1 })
  })

  it.each([
    ['true', true, 'Account Issues'],
    ['false', false, 'Disabled Category'],
    ['1', true, 'Account Issues'],
    ['0', false, 'Disabled Category'],
  ] as const)('filters categories when enabled=%s', async (enabled, expectedEnabled, name) => {
    const { app, adminToken, ticketCategoryRepository } = await buildApp()
    await ticketCategoryRepository.insert({
      name: 'Disabled Category',
      description: null,
      enabled: false,
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/ticket-categories?enabled=${enabled}`,
      headers: authed(adminToken),
    })
    const body = await response.json()

    expect(response.statusCode).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ name, enabled: expectedEnabled })
    expect(body.meta.total).toBe(1)
  })

  it('rejects an invalid enabled query value', async () => {
    const { app, adminToken } = await buildApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/ticket-categories?enabled=maybe',
      headers: authed(adminToken),
    })

    expect(response.statusCode).toBe(400)
    expect((await response.json()).code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/ticket-categories/:id', () => {
  it('returns a category or 404', async () => {
    const { app, adminToken, ticketCategoryRepository } = await buildApp()
    const existing = await ticketCategoryRepository.findByName('Account Issues')
    const found = await app.inject({
      method: 'GET',
      url: `/api/ticket-categories/${existing!.id}`,
      headers: authed(adminToken),
    })
    expect(found.statusCode).toBe(200)

    const missing = await app.inject({
      method: 'GET',
      url: '/api/ticket-categories/missing',
      headers: authed(adminToken),
    })
    expect(missing.statusCode).toBe(404)
    expect((await missing.json()).code).toBe('CATEGORY_NOT_FOUND')
  })
})

describe('PATCH /api/ticket-categories/:id', () => {
  it('updates a category and rejects an empty body', async () => {
    const { app, adminToken, ticketCategoryRepository } = await buildApp()
    const existing = await ticketCategoryRepository.findByName('Account Issues')

    const update = await app.inject({
      method: 'PATCH',
      url: `/api/ticket-categories/${existing!.id}`,
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({ enabled: false, description: 'Login-related issues' }),
    })
    expect(update.statusCode).toBe(200)
    expect((await update.json()).data).toMatchObject({
      enabled: false,
      description: 'Login-related issues',
    })

    const empty = await app.inject({
      method: 'PATCH',
      url: `/api/ticket-categories/${existing!.id}`,
      headers: { ...authed(adminToken), ...jsonHeaders },
      payload: JSON.stringify({}),
    })
    expect(empty.statusCode).toBe(400)
  })
})
