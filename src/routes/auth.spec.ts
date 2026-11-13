import { describe, expect, it } from 'vitest'

import { signAccessToken } from '../lib/access-token.ts'
import { hashPassword } from '../lib/password.ts'
import { MemoryRefreshTokenRepository, MemoryUserRepository } from '../repositories/fakes.ts'
import { createApp } from '../main.ts'
import { loginResponseSchema, meResponseSchema } from '../schemas/auth.ts'
import { createMemoryLoginAttemptTracker } from '../services/login-protection.ts'
import type { AppInstance } from '../types.ts'

const PASSWORD = 'correct-horse-battery'

const buildApp = async () => {
  const userRepository = new MemoryUserRepository()
  const refreshTokenRepository = new MemoryRefreshTokenRepository()
  const app = await createApp({ userRepository, refreshTokenRepository })
  const admin = await userRepository.insert({
    username: 'admin',
    passwordHash: await hashPassword(PASSWORD),
    displayName: 'Administrator',
    role: 'admin',
    status: 'active',
  })
  return { app, userRepository, admin }
}

const post = (app: AppInstance, path: string, body: unknown, token?: string) =>
  app.inject({
    method: 'POST',
    url: path,
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    payload: JSON.stringify(body),
  })

describe('POST /api/auth/login (route)', () => {
  it('accepts the local admin password at login', async () => {
    const shortHash = await hashPassword('admin')
    const localUsers = new MemoryUserRepository()
    await localUsers.insert({
      username: 'admin',
      passwordHash: shortHash,
      displayName: null,
      role: 'admin',
      status: 'active',
    })
    const localApp = await createApp({
      userRepository: localUsers,
      refreshTokenRepository: new MemoryRefreshTokenRepository(),
    })
    const response = await post(localApp, '/api/auth/login', {
      username: 'admin',
      password: 'admin',
    })
    expect(response.statusCode).toBe(200)
  })

  it('returns the token pair in the common envelope and matches the response schema', async () => {
    const { app } = await buildApp()

    const response = await post(app, '/api/auth/login', {
      username: 'admin',
      password: PASSWORD,
    })
    const body = await response.json()

    expect(response.statusCode).toBe(200)
    expect(body.path).toBe('/api/auth/login')
    expect(body.code).toBe('OK')
    expect(body.message).toBe('OK')
    expect(() => loginResponseSchema.parse(body)).not.toThrow()
  })

  it('answers unknown user and wrong password with identical bodies (modulo date)', async () => {
    const { app } = await buildApp()

    const unknownResponse = await post(app, '/api/auth/login', {
      username: 'ghost',
      password: PASSWORD,
    })
    const wrongResponse = await post(app, '/api/auth/login', {
      username: 'admin',
      password: 'totally-wrong-password',
    })

    const unknownBody = await unknownResponse.json()
    const wrongBody = await wrongResponse.json()

    expect(unknownResponse.statusCode).toBe(401)
    expect(wrongResponse.statusCode).toBe(401)
    const { date: _u, ...unknownRest } = unknownBody
    const { date: _w, ...wrongRest } = wrongBody
    expect(unknownRest).toEqual(wrongRest)
    expect(unknownBody.code).toBe('AUTH_INVALID_CREDENTIALS')
    expect(unknownBody.errors.message).toEqual(['Invalid username or password'])
  })

  it('maps a disabled account to 403 and validation issues to 400', async () => {
    const { app, userRepository, admin } = await buildApp()
    userRepository.setStatus(admin.id, 'disabled')

    const disabledResponse = await post(app, '/api/auth/login', {
      username: 'admin',
      password: PASSWORD,
    })
    expect(disabledResponse.statusCode).toBe(403)
    const disabledBody = await disabledResponse.json()
    expect(disabledBody.code).toBe('AUTH_ACCOUNT_DISABLED')

    const invalidResponse = await post(app, '/api/auth/login', {
      username: 'Bad Name',
      password: '',
    })
    expect(invalidResponse.statusCode).toBe(400)
    const invalidBody = await invalidResponse.json()
    expect(invalidBody.code).toBe('VALIDATION_ERROR')
    expect(Array.isArray(invalidBody.errors.message)).toBe(true)
    expect(invalidBody.errors.message.length).toBeGreaterThanOrEqual(2)
  })
})

describe('POST /api/auth/refresh (route)', () => {
  it('rotates and then kills the whole session on replay', async () => {
    const { app } = await buildApp()
    const loginResponse = await post(app, '/api/auth/login', {
      username: 'admin',
      password: PASSWORD,
    })
    const loginBody = await loginResponse.json()

    const refreshResponse = await post(app, '/api/auth/refresh', {
      refreshToken: loginBody.data.refreshToken,
    })
    expect(refreshResponse.statusCode).toBe(200)
    const refreshBody = await refreshResponse.json()
    expect(refreshBody.data.refreshToken).not.toBe(loginBody.data.refreshToken)

    const replayResponse = await post(app, '/api/auth/refresh', {
      refreshToken: loginBody.data.refreshToken,
    })
    expect(replayResponse.statusCode).toBe(401)
    expect((await replayResponse.json()).code).toBe('AUTH_INVALID_REFRESH_TOKEN')

    const followUpResponse = await post(app, '/api/auth/refresh', {
      refreshToken: refreshBody.data.refreshToken,
    })
    expect(followUpResponse.statusCode).toBe(401)
  })

  it('rejects a malformed refresh token with 400 VALIDATION_ERROR', async () => {
    const { app } = await buildApp()
    const response = await post(app, '/api/auth/refresh', { refreshToken: 'too-short' })
    expect(response.statusCode).toBe(400)
    expect((await response.json()).code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/auth/logout (route)', () => {
  it('requires authentication and returns a bare success envelope', async () => {
    const { app } = await buildApp()

    const loginResponse = await post(app, '/api/auth/login', {
      username: 'admin',
      password: PASSWORD,
    })
    const { accessToken, refreshToken } = (await loginResponse.json()).data

    const unauthenticated = await post(app, '/api/auth/logout', { refreshToken })
    expect(unauthenticated.statusCode).toBe(401)
    expect((await unauthenticated.json()).code).toBe('UNAUTHORIZED')

    const logoutResponse = await post(app, '/api/auth/logout', { refreshToken }, accessToken)
    expect(logoutResponse.statusCode).toBe(200)
    const logoutBody = await logoutResponse.json()
    expect(logoutBody.code).toBe('OK')
    expect('data' in logoutBody).toBe(false)

    const refreshAfterLogout = await post(app, '/api/auth/refresh', { refreshToken })
    expect(refreshAfterLogout.statusCode).toBe(401)
  })
})

describe('GET /api/auth/me (route)', () => {
  it('returns the current user for a valid token', async () => {
    const { app, admin } = await buildApp()
    const token = await signAccessToken({ sub: admin.id, role: 'admin' })

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await response.json()

    expect(response.statusCode).toBe(200)
    expect(body.data.id).toBe(admin.id)
    expect(() => meResponseSchema.parse(body)).not.toThrow()
  })

  it('maps an unresolvable sub to 401 and a disabled account to 403', async () => {
    const { app, userRepository, admin } = await buildApp()

    const ghostToken = await signAccessToken({ sub: 'missing-user', role: 'admin' })
    const ghostResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${ghostToken}` },
    })
    expect(ghostResponse.statusCode).toBe(401)
    expect((await ghostResponse.json()).code).toBe('UNAUTHORIZED')

    userRepository.setStatus(admin.id, 'disabled')
    const disabledToken = await signAccessToken({ sub: admin.id, role: 'admin' })
    const disabledResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${disabledToken}` },
    })
    expect(disabledResponse.statusCode).toBe(403)
    expect((await disabledResponse.json()).code).toBe('AUTH_ACCOUNT_DISABLED')
  })
})

describe('OpenAPI integration', () => {
  it('registers the bearerAuth scheme and per-route security', async () => {
    const { app } = await buildApp()
    const response = await app.inject({ method: 'GET', url: '/openapi.json' })
    const doc = await response.json()

    expect(doc.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: expect.stringContaining('Authorize'),
    })
    expect(doc.paths['/api/auth/me'].get.security).toEqual([{ bearerAuth: [] }])
    expect(doc.paths['/api/auth/login'].post.security).toEqual([])
    expect(doc.paths['/health'].get.security).toEqual([])
  })
})

describe('POST /api/auth/login — login protection', () => {
  const buildProtectedApp = async (
    trackerOptions: Parameters<typeof createMemoryLoginAttemptTracker>[0],
  ) => {
    const userRepository = new MemoryUserRepository()
    const refreshTokenRepository = new MemoryRefreshTokenRepository()
    const tracker = createMemoryLoginAttemptTracker(trackerOptions)
    const app = await createApp({
      userRepository,
      refreshTokenRepository,
      loginAttemptTracker: tracker,
    })
    await userRepository.insert({
      username: 'admin',
      passwordHash: await hashPassword(PASSWORD),
      displayName: null,
      role: 'admin',
      status: 'active',
    })
    return { app }
  }

  it('locks an account after repeated credential failures', async () => {
    const { app } = await buildProtectedApp({ maxFailures: 2, ipFailureLimit: 1000 })

    await post(app, '/api/auth/login', { username: 'admin', password: 'wrong-password-1' })
    await post(app, '/api/auth/login', { username: 'admin', password: 'wrong-password-2' })

    const locked = await post(app, '/api/auth/login', { username: 'admin', password: PASSWORD })
    expect(locked.statusCode).toBe(423)
    expect((await locked.json()).code).toBe('AUTH_ACCOUNT_LOCKED')
  })

  it('rate limits by IP across different usernames', async () => {
    const { app } = await buildProtectedApp({ maxFailures: 100, ipFailureLimit: 2 })

    await post(app, '/api/auth/login', { username: 'ghost1', password: 'wrong-password-1' })
    await post(app, '/api/auth/login', { username: 'ghost2', password: 'wrong-password-2' })

    const blocked = await post(app, '/api/auth/login', {
      username: 'ghost3',
      password: 'wrong-password-3',
    })
    expect(blocked.statusCode).toBe(429)
    expect((await blocked.json()).code).toBe('AUTH_RATE_LIMITED')
  })

  it('resets the failure streak on a successful login', async () => {
    const { app } = await buildProtectedApp({ maxFailures: 2, ipFailureLimit: 1000 })

    await post(app, '/api/auth/login', { username: 'admin', password: 'wrong-password-1' })
    const success = await post(app, '/api/auth/login', { username: 'admin', password: PASSWORD })
    expect(success.statusCode).toBe(200)

    // One failure after a success must not lock the account.
    const failure = await post(app, '/api/auth/login', {
      username: 'admin',
      password: 'wrong-password-2',
    })
    expect(failure.statusCode).toBe(401)
    expect((await failure.json()).code).toBe('AUTH_INVALID_CREDENTIALS')
  })
})
