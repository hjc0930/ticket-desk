import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, getDatabase } from '../src/db/client.ts'
import { runMigrations } from '../src/db/migrate.ts'
import { seedAdmin } from '../src/db/seed.ts'
import { createApp } from '../src/main.ts'
import { DrizzleUserRepository } from '../src/repositories/user-repository.ts'
import { listenOnFirstAvailablePort } from '../src/server.ts'

type TestServer = Awaited<ReturnType<typeof listenOnFirstAvailablePort>>

// vitest.setup.ts points every suite at an isolated in-memory PGlite database, so this
// file exercises the real migration, seed, repository, and HTTP layers without ever
// touching a developer's .data/pglite directory or a live PostgreSQL.
const ADMIN_USERNAME = 'e2e-admin'
const ADMIN_PASSWORD = 'e2e-admin-password'

const closeServer = async (server: TestServer) => {
  await server.close()
}

describe('Authentication over HTTP with an isolated database (e2e)', () => {
  let applicationServer: TestServer
  let baseUrl: string

  beforeAll(async () => {
    await runMigrations()
    await seedAdmin(new DrizzleUserRepository(getDatabase), {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    })

    applicationServer = await listenOnFirstAvailablePort(createApp, 0)
    baseUrl = `http://127.0.0.1:${(applicationServer.server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await closeServer(applicationServer)
    await closeDatabase()
  })

  it('logs in the seeded admin and returns a token pair', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.code).toBe('OK')
    expect(body.data.user).toMatchObject({ username: ADMIN_USERNAME, role: 'admin' })
    expect(typeof body.data.accessToken).toBe('string')
    expect(typeof body.data.refreshToken).toBe('string')
  })

  it('rejects a wrong password with the invalid-credentials failure envelope', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: 'wrong-password' }),
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.code).toBe('AUTH_INVALID_CREDENTIALS')
    expect(body.errors.message[0]).toBeTruthy()
  })
})
