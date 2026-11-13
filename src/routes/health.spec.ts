import { describe, expect, it } from 'vitest'

import { createApp } from '../main.ts'

describe('GET /health', () => {
  it('returns the health payload in the common envelope and a request ID header', async () => {
    const app = await createApp()
    const response = await app.inject({ method: 'GET', url: '/health' })
    const body = await response.json()

    expect(response.statusCode).toBe(200)
    expect(response.headers['x-request-id']).toBeTruthy()
    expect(body).toMatchObject({
      path: '/health',
      message: 'OK',
      code: 'OK',
      data: { status: 'ok' },
    })
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('publishes the OpenAPI document and Swagger UI', async () => {
    const app = await createApp()
    const [openApiResponse, docsResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/openapi.json' }),
      app.inject({ method: 'GET', url: '/docs' }),
    ])

    expect(openApiResponse.statusCode).toBe(200)
    expect(openApiResponse.json()).toMatchObject({
      openapi: '3.1.0',
    })
    expect(docsResponse.statusCode).toBe(200)
    expect(docsResponse.body).toContain('swagger')
  })
})
