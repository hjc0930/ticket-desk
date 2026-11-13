import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/main.ts'
import { listenOnFirstAvailablePort } from '../src/server.ts'

type TestServer = Awaited<ReturnType<typeof listenOnFirstAvailablePort>>

const closeServer = async (server: TestServer) => {
  await server.close()
}

describe('Application (e2e)', () => {
  let applicationServer: TestServer
  let baseUrl: string
  let occupiedPort: number
  let selectedPort: number

  beforeAll(async () => {
    const occupyingServer = createServer()
    await new Promise<void>((resolve) => occupyingServer.listen(0, resolve))
    occupiedPort = (occupyingServer.address() as AddressInfo).port

    try {
      applicationServer = await listenOnFirstAvailablePort(
        createApp,
        occupiedPort,
        occupiedPort + 10,
      )
    } finally {
      await new Promise<void>((resolve, reject) => {
        occupyingServer.close((error) => (error ? reject(error) : resolve()))
      })
    }

    selectedPort = (applicationServer.server.address() as AddressInfo).port
    baseUrl = `http://127.0.0.1:${selectedPort}`
  })

  afterAll(async () => {
    await closeServer(applicationServer)
  })

  it('starts on the next available port', () => {
    expect(selectedPort).toBeGreaterThan(occupiedPort)
  })

  it('GET /health returns the common envelope', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { 'x-request-id': 'e2e-health-request' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBe('e2e-health-request')
    expect(body).toMatchObject({
      path: '/health',
      message: 'OK',
      code: 'OK',
      data: { status: 'ok' },
    })
  })

  it('publishes OpenAPI and Swagger over HTTP', async () => {
    const [openApiResponse, docsResponse] = await Promise.all([
      fetch(`${baseUrl}/openapi.json`),
      fetch(`${baseUrl}/docs`),
    ])

    expect(openApiResponse.status).toBe(200)
    await expect(openApiResponse.json()).resolves.toMatchObject({ openapi: '3.1.0' })
    expect(docsResponse.status).toBe(200)
    await expect(docsResponse.text()).resolves.toContain('swagger-ui')
  })

  it('returns the failure envelope for an unknown route', async () => {
    const response = await fetch(`${baseUrl}/missing`, {
      headers: { 'x-request-id': 'e2e-missing-request' },
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toMatchObject({
      path: '/missing',
      message: 'Route not found',
      code: 'NOT_FOUND',
      errors: { message: ['Route not found'] },
    })
    expect(response.headers.get('x-request-id')).toBe('e2e-missing-request')
  })
})
