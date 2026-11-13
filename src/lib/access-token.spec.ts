import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { env } from '../config/env.ts'
import { signAccessToken, verifyAccessToken } from './access-token.ts'

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

// Hand-rolled HS256/HS512 signer so tests can control exp, secret, and algorithm.
const digests = { HS256: 'sha256', HS512: 'sha512' } as const

const signToken = (payload: object, secret: string, algorithm: keyof typeof digests) => {
  const header = base64url({ alg: algorithm, typ: 'JWT' })
  const body = base64url(payload)
  const signature = createHmac(digests[algorithm], secret)
    .update(`${header}.${body}`)
    .digest('base64url')
  return `${header}.${body}.${signature}`
}

describe('access token', () => {
  it('signs and verifies a token roundtrip', async () => {
    const token = await signAccessToken({ sub: 'user-1', role: 'admin' })
    await expect(verifyAccessToken(token)).resolves.toEqual({ sub: 'user-1', role: 'admin' })
  })

  it('returns null for an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 60
    const token = signToken(
      { sub: 'user-1', role: 'user', iat: past - 10, exp: past },
      env.JWT_SECRET,
      'HS256',
    )
    await expect(verifyAccessToken(token)).resolves.toBeNull()
  })

  it('returns null for a token signed with a different secret', async () => {
    const foreign = signToken(
      { sub: 'user-1', role: 'user', exp: Math.floor(Date.now() / 1000) + 60 },
      'x'.repeat(48),
      'HS256',
    )
    await expect(verifyAccessToken(foreign)).resolves.toBeNull()
  })

  it('returns null for tokens with a foreign or absent algorithm', async () => {
    const forged = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
      sub: 'user-1',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 60,
    })}.`
    await expect(verifyAccessToken(forged)).resolves.toBeNull()

    const hs512 = signToken(
      { sub: 'user-1', role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 },
      env.JWT_SECRET,
      'HS512',
    )
    await expect(verifyAccessToken(hs512)).resolves.toBeNull()
    await expect(verifyAccessToken('not-a-jwt')).resolves.toBeNull()
  })
})
