import { z } from 'zod'

import {
  bareSuccessEnvelopeSchema,
  failureEnvelopeSchema,
  successEnvelopeSchema,
} from './envelope.ts'

export const usernameSchema = z
  .string()
  .regex(/^[a-z0-9_-]{3,32}$/)
  .meta({
    description: 'Login username: 3-32 lowercase letters, digits, underscores, or hyphens.',
    example: 'demo_user',
  })

export const loginRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128).meta({
    description:
      'Password of 1-128 characters; account creation requires at least 8 characters. Request-only; never included in a response.',
    writeOnly: true,
  }),
})

export const publicUserSchema = z.object({
  id: z.string().meta({
    description: 'Unique resource ID.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
  username: z.string().meta({ description: 'Login username.', example: 'demo_user' }),
  displayName: z.string().nullable().meta({
    description: 'User display name, independent of the login username. May be null.',
    example: 'Example User',
  }),
  role: z.enum(['admin', 'agent', 'user']).meta({
    description: 'Role: admin (administrator), agent (support staff), or user (requester).',
    example: 'user',
  }),
  status: z
    .enum(['active', 'disabled'])
    .meta({ description: 'Account status: active (enabled) or disabled.', example: 'active' }),
})

export const loginDataSchema = z.object({
  accessToken: z.string().meta({
    description: 'JWT access token for the Authorization: Bearer request header. Keep it private.',
  }),
  tokenType: z
    .literal('Bearer')
    .meta({ description: 'Access token scheme; always Bearer.', example: 'Bearer' }),
  expiresIn: z.number().int().positive().meta({
    description:
      'Access token lifetime in seconds. Defaults to 900; use the value returned by this response.',
    example: 900,
  }),
  refreshToken: z.string().meta({
    description:
      'Refresh token. Replace it after each refresh. Request values contain exactly 43 base64url characters.',
  }),
  user: publicUserSchema.meta({
    description: 'Public details of the authenticated user, without a password or password hash.',
  }),
})

export const loginResponseSchema = successEnvelopeSchema(loginDataSchema)

export const refreshRequestSchema = z.object({
  refreshToken: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .meta({
      description:
        'Refresh token. Replace it after each refresh. Request values contain exactly 43 base64url characters.',
    }),
})

export const refreshDataSchema = z.object({
  accessToken: z.string().meta({
    description: 'JWT access token for the Authorization: Bearer request header. Keep it private.',
  }),
  tokenType: z
    .literal('Bearer')
    .meta({ description: 'Access token scheme; always Bearer.', example: 'Bearer' }),
  expiresIn: z.number().int().positive().meta({
    description:
      'Access token lifetime in seconds. Defaults to 900; use the value returned by this response.',
    example: 900,
  }),
  refreshToken: z.string().meta({
    description:
      'Refresh token. Replace it after each refresh. Request values contain exactly 43 base64url characters.',
  }),
})

export const refreshResponseSchema = successEnvelopeSchema(refreshDataSchema)

export const logoutResponseSchema = bareSuccessEnvelopeSchema

export const meDataSchema = publicUserSchema

export const meResponseSchema = successEnvelopeSchema(meDataSchema)

export const authFailureResponseSchema = failureEnvelopeSchema
