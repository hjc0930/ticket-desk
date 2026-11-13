import { z } from 'zod'

import { paginatedEnvelope, successEnvelope } from '../lib/response.ts'
import { requireAuth, requireRole } from '../middleware/guards.ts'
import { requestPath } from '../middleware/request-context.ts'
import { DrizzleUserRepository } from '../repositories/user-repository.ts'
import type { UserListFilter, UserPatch, UserRepository } from '../repositories/user-repository.ts'
import { withResponseDescription } from '../schemas/envelope.ts'
import {
  createUserRequestSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  updateUserRequestSchema,
  userFailureResponseSchema,
  userListQuerySchema,
  userListResponseSchema,
  userResponseSchema,
} from '../schemas/user.ts'
import type { UserListQueryType } from '../schemas/user.ts'
import { createUserManagementService } from '../services/user-management.ts'
import type { AppInstance } from '../types.ts'

export type UserRouteDependencies = {
  userRepository?: UserRepository
}

const idParamSchema = z.object({
  id: z.string().min(1).meta({
    description: 'Target user ID, as returned by a user creation or query operation.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
})

const UNAUTHORIZED_DESCRIPTION =
  'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.'

const toFilter = (query: UserListQueryType): UserListFilter => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.role !== undefined ? { role: query.role } : {}),
  ...(query.status !== undefined ? { status: query.status } : {}),
  ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
})

export const registerUserRoutes = (app: AppInstance, dependencies: UserRouteDependencies = {}) => {
  const service = createUserManagementService({
    userRepository: dependencies.userRepository ?? new DrizzleUserRepository(),
  })

  app.post(
    '/api/users',
    {
      onRequest: [requireAuth, requireRole('admin')],
      schema: {
        operationId: 'createUser',
        tags: ['Users'],
        summary: 'Create a user (admin)',
        description:
          'Requires admin. The username must be unique and cannot be changed after creation. role defaults to user and the initial status is always active. Omitting displayName stores null. Returns public account details without a password or password hash.',
        security: [{ bearerAuth: [] }],
        body: createUserRequestSchema,
        response: {
          200: withResponseDescription(
            userResponseSchema,
            'OK: data contains the created public user with status active.',
          ),
          400: withResponseDescription(
            userFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(userFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            userFailureResponseSchema,
            'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
          ),
          409: withResponseDescription(
            userFailureResponseSchema,
            'USERNAME_TAKEN: the username is already in use.',
          ),
          500: withResponseDescription(
            userFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const body = request.body
      const user = await service.createUser({
        username: body.username,
        password: body.password,
        role: body.role,
        displayName: body.displayName ?? null,
      })
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: user }))
    },
  )

  app.get(
    '/api/users',
    {
      onRequest: [requireAuth, requireRole('admin')],
      schema: {
        operationId: 'listUsers',
        tags: ['Users'],
        summary: 'List users with pagination (admin)',
        description:
          'Requires admin. Supports exact role/status filters and a case-insensitive keyword search across username and displayName. Filters apply together. Results are ordered by creation time ascending. data contains the user array and meta contains pagination details. No matches return an empty array.',
        security: [{ bearerAuth: [] }],
        querystring: userListQuerySchema,
        response: {
          200: withResponseDescription(
            userListResponseSchema,
            'OK: data contains the user array and meta contains pagination details.',
          ),
          400: withResponseDescription(
            userFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(userFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            userFailureResponseSchema,
            'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
          ),
          500: withResponseDescription(
            userFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const query = request.query
      const { items, total } = await service.listUsers(toFilter(query))
      const totalPages = Math.ceil(total / query.pageSize)
      reply.code(200).send(
        paginatedEnvelope({
          path: requestPath(request),
          data: items,
          meta: { page: query.page, pageSize: query.pageSize, total, totalPages },
        }),
      )
    },
  )

  app.get(
    '/api/users/:id',
    {
      onRequest: [requireAuth, requireRole('admin')],
      schema: {
        operationId: 'getUser',
        tags: ['Users'],
        summary: 'Get user details (admin)',
        description:
          'Requires admin. Looks up public account details by user ID. A missing account returns USER_NOT_FOUND. Passwords and password hashes are never returned.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: withResponseDescription(
            userResponseSchema,
            'OK: data contains the requested public user.',
          ),
          400: withResponseDescription(
            userFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(userFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            userFailureResponseSchema,
            'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
          ),
          404: withResponseDescription(
            userFailureResponseSchema,
            'USER_NOT_FOUND: the target user does not exist.',
          ),
          500: withResponseDescription(
            userFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const user = await service.getUser(request.params.id)
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: user }))
    },
  )

  app.patch(
    '/api/users/:id',
    {
      onRequest: [requireAuth, requireRole('admin')],
      schema: {
        operationId: 'updateUser',
        tags: ['Users'],
        summary: 'Update user details and permissions (admin)',
        description:
          'Requires admin. Partially updates displayName, role, or status; at least one defined field is required. Omitted fields remain unchanged and displayName=null clears the display name. The username cannot be changed. Administrators cannot submit a role update for themselves, even with the same value, or disable their own account. Role changes and disabling may take until existing access tokens expire to affect ordinary routes.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: updateUserRequestSchema,
        response: {
          200: withResponseDescription(
            userResponseSchema,
            'OK: data contains the updated public user.',
          ),
          400: withResponseDescription(
            userFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(userFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            userFailureResponseSchema,
            'FORBIDDEN: administrator role required; or SELF_MODIFICATION_FORBIDDEN: attempted to change the their own administrator role or disable their own account.',
          ),
          404: withResponseDescription(
            userFailureResponseSchema,
            'USER_NOT_FOUND: the target user does not exist.',
          ),
          500: withResponseDescription(
            userFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const body = request.body
      const actorId = request.user!.id
      const patch: UserPatch = {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      }
      const user = await service.updateUser(id, actorId, patch)
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: user }))
    },
  )

  app.post(
    '/api/users/:id/reset-password',
    {
      onRequest: [requireAuth, requireRole('admin')],
      schema: {
        operationId: 'resetPassword',
        tags: ['Users'],
        summary: 'Reset a user password (admin)',
        description:
          'Requires admin. Sets a new password of 8-128 characters and stores its hash. A missing account returns USER_NOT_FOUND. Success returns only the envelope, without data. Existing access tokens and refresh tokens are not revoked by this operation.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: resetPasswordRequestSchema,
        response: {
          200: withResponseDescription(
            resetPasswordResponseSchema,
            'OK: the password was reset. The response omits data.',
          ),
          400: withResponseDescription(
            userFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(userFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            userFailureResponseSchema,
            'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
          ),
          404: withResponseDescription(
            userFailureResponseSchema,
            'USER_NOT_FOUND: the target user does not exist.',
          ),
          500: withResponseDescription(
            userFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      await service.resetPassword(request.params.id, request.body.password)
      reply.code(200).send(successEnvelope({ path: requestPath(request) }))
    },
  )
}
