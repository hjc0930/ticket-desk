import { z } from 'zod'

import {
  bareSuccessEnvelopeSchema,
  failureEnvelopeSchema,
  paginatedEnvelopeSchema,
  successEnvelopeSchema,
} from './envelope.ts'
import { paginationQuerySchema } from './pagination.ts'
import { publicUserSchema, usernameSchema } from './auth.ts'

export const createUserRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(128).meta({
    description: 'Password of 8-128 characters. Request-only; never included in a response.',
    writeOnly: true,
  }),
  displayName: z.string().trim().min(1).optional().meta({
    description:
      'Optional display name, non-empty after trimming. Independent of the login username.',
    example: 'Example User',
  }),
  role: z.enum(['admin', 'agent', 'user']).default('user').meta({
    description:
      'Role: admin (administrator), agent (support staff), or user (requester). Defaults to user on creation.',
    example: 'user',
  }),
})

export const userListQuerySchema = paginationQuerySchema.extend({
  role: z.enum(['admin', 'agent', 'user']).optional().meta({
    description: 'Optional role: admin, agent, or user.',
    example: 'user',
  }),
  status: z
    .enum(['active', 'disabled'])
    .optional()
    .meta({ description: 'Optional account status: active or disabled.', example: 'active' }),
  keyword: z.string().trim().min(1).optional().meta({
    description:
      'Optional non-empty keyword after trimming. Case-insensitive search across username and displayName.',
    example: 'login',
  }),
})

export type UserListQueryType = z.infer<typeof userListQuerySchema>

export const updateUserRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).nullable().optional().meta({
      description: 'Optional display name, non-empty after trimming. Use null to clear it.',
      example: 'Example User',
    }),
    role: z.enum(['admin', 'agent', 'user']).optional().meta({
      description: 'Optional role: admin, agent, or user.',
      example: 'user',
    }),
    status: z.enum(['active', 'disabled']).optional().meta({
      description: 'Optional account status: active or disabled.',
      example: 'active',
    }),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  })

export const resetPasswordRequestSchema = z.object({
  password: z.string().min(8).max(128).meta({
    description: 'Password of 8-128 characters. Request-only; never included in a response.',
    writeOnly: true,
  }),
})

export const userResponseSchema = successEnvelopeSchema(publicUserSchema)

export const userListResponseSchema = paginatedEnvelopeSchema(publicUserSchema)

export const resetPasswordResponseSchema = bareSuccessEnvelopeSchema

export const userFailureResponseSchema = failureEnvelopeSchema
