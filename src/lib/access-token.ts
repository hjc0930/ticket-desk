import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '../config/env.ts'
import type { UserRole } from '../types.ts'

export type AccessTokenPayload = {
  sub: string
  role: UserRole
}

const base64Url = (data: string | Buffer) => Buffer.from(data).toString('base64url')

const hmac = (input: string, secret: string) =>
  createHmac('sha256', secret).update(input).digest('base64url')

export const signAccessToken = async (payload: AccessTokenPayload): Promise<string> => {
  const issuedAt = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64Url(
    JSON.stringify({
      sub: payload.sub,
      role: payload.role,
      iat: issuedAt,
      exp: issuedAt + env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    }),
  )
  const signature = hmac(`${header}.${body}`, env.JWT_SECRET)
  return `${header}.${body}.${signature}`
}

type DecodedToken = {
  sub?: unknown
  role?: unknown
  exp?: unknown
}

export const verifyAccessToken = async (token: string): Promise<AccessTokenPayload | null> => {
  try {
    const [header, body, signature] = token.split('.')
    if (!header || !body || !signature) return null

    const headerJson = JSON.parse(Buffer.from(header, 'base64url').toString()) as {
      alg?: unknown
    }
    if (headerJson.alg !== 'HS256') return null

    // Compare the base64url encodings byte-for-byte (both decoded as raw bytes).
    const expected = Buffer.from(hmac(`${header}.${body}`, env.JWT_SECRET), 'base64url')
    const provided = Buffer.from(signature, 'base64url')
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null

    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString()) as DecodedToken
    if (typeof decoded.exp !== 'number' || decoded.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    if (typeof decoded.sub !== 'string' || decoded.sub.length === 0) return null
    if (decoded.role !== 'admin' && decoded.role !== 'agent' && decoded.role !== 'user') {
      return null
    }
    return { sub: decoded.sub, role: decoded.role }
  } catch {
    return null
  }
}
