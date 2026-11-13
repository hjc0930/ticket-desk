import { AppError } from '../lib/errors.ts'
import { successEnvelope } from '../lib/response.ts'
import { requireAuth } from '../middleware/guards.ts'
import { requestPath } from '../middleware/request-context.ts'
import type { FastifyRequest } from 'fastify'
import { DrizzleRefreshTokenRepository } from '../repositories/refresh-token-repository.ts'
import type { RefreshTokenRepository } from '../repositories/refresh-token-repository.ts'
import { DrizzleUserRepository } from '../repositories/user-repository.ts'
import type { UserRepository } from '../repositories/user-repository.ts'
import { withResponseDescription } from '../schemas/envelope.ts'
import {
  authFailureResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  meResponseSchema,
  refreshRequestSchema,
  refreshResponseSchema,
} from '../schemas/auth.ts'
import { createAuthService } from '../services/auth.ts'
import {
  createMemoryLoginAttemptTracker,
  type LoginAttemptTracker,
} from '../services/login-protection.ts'
import type { AppInstance } from '../types.ts'

export type AuthRouteDependencies = {
  userRepository?: UserRepository
  refreshTokenRepository?: RefreshTokenRepository
  loginAttemptTracker?: LoginAttemptTracker
}

const clientIp = (request: FastifyRequest): string => {
  const forwarded = request.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  const value = first?.trim()
  return value && value.length > 0 ? value : 'local'
}

export const registerAuthRoutes = (app: AppInstance, dependencies: AuthRouteDependencies = {}) => {
  const authService = createAuthService({
    userRepository: dependencies.userRepository ?? new DrizzleUserRepository(),
    refreshTokenRepository:
      dependencies.refreshTokenRepository ?? new DrizzleRefreshTokenRepository(),
  })
  const loginAttemptTracker = dependencies.loginAttemptTracker ?? createMemoryLoginAttemptTracker()

  app.post(
    '/api/auth/login',
    {
      schema: {
        operationId: 'login',
        tags: ['Auth'],
        summary: 'Log in with username and password',
        description:
          'Public endpoint; no access token is required. Valid credentials return user details and an access/refresh token pair. Usernames contain 3-32 lowercase letters, digits, underscores, or hyphens; passwords contain 8-128 characters. Unknown usernames and incorrect passwords both return AUTH_INVALID_CREDENTIALS. Defaults: 5 consecutive failures lock an account for 900 seconds; 20 failures from one IP within 900 seconds trigger throttling. Limits are configurable and block subsequent attempts after the threshold is reached. A successful login clears the account failure count; IP failures remain until the window expires.',
        security: [],
        body: loginRequestSchema,
        response: {
          200: withResponseDescription(
            loginResponseSchema,
            'OK: data contains the authenticated user and token pair.',
          ),
          400: withResponseDescription(
            authFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(
            authFailureResponseSchema,
            'AUTH_INVALID_CREDENTIALS: unknown username or incorrect password; the response does not distinguish them.',
          ),
          403: withResponseDescription(
            authFailureResponseSchema,
            'AUTH_ACCOUNT_DISABLED: credentials are correct, but the account is disabled.',
          ),
          423: withResponseDescription(
            authFailureResponseSchema,
            'AUTH_ACCOUNT_LOCKED: consecutive login failures have temporarily locked the account.',
          ),
          429: withResponseDescription(
            authFailureResponseSchema,
            'AUTH_RATE_LIMITED: the source IP has reached its failure limit within the configured window.',
          ),
          500: withResponseDescription(
            authFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const body = request.body
      const ip = clientIp(request)
      loginAttemptTracker.assertAllowed(ip, body.username)

      try {
        const result = await authService.login(body)
        loginAttemptTracker.recordSuccess(body.username)
        reply.code(200).send(successEnvelope({ path: requestPath(request), data: result }))
      } catch (error) {
        if (error instanceof AppError && error.code === 'AUTH_INVALID_CREDENTIALS') {
          loginAttemptTracker.recordFailure(ip, body.username)
        }
        throw error
      }
    },
  )

  app.post(
    '/api/auth/refresh',
    {
      schema: {
        operationId: 'refresh',
        tags: ['Auth'],
        summary: 'Refresh and rotate tokens',
        description:
          'Public endpoint. Submit refreshToken in the JSON body; no Bearer access token is required. Success returns a new token pair and immediately invalidates the old refresh token. Store the replacement pair. Unknown, expired, or revoked tokens and disabled accounts return AUTH_INVALID_REFRESH_TOKEN. Reusing a rotated or revoked token also revokes all refresh tokens for that user.',
        security: [],
        body: refreshRequestSchema,
        response: {
          200: withResponseDescription(
            refreshResponseSchema,
            'OK: data contains the replacement token pair. Replace the stored tokens.',
          ),
          400: withResponseDescription(
            authFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(
            authFailureResponseSchema,
            'AUTH_INVALID_REFRESH_TOKEN: unknown, expired, or revoked refresh token, or unavailable account. Token reuse revokes all refresh tokens for that user.',
          ),
          500: withResponseDescription(
            authFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const result = await authService.refresh(request.body)
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: result }))
    },
  )

  app.post(
    '/api/auth/logout',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'logout',
        tags: ['Auth'],
        summary: 'Log out and revoke a refresh token',
        description:
          'Requires a valid Bearer access token and the refreshToken to revoke in the JSON body. Success returns the envelope without data. Only the submitted refresh token is revoked; access tokens remain valid until expiry. Unknown or already revoked refresh tokens return AUTH_INVALID_REFRESH_TOKEN.',
        security: [{ bearerAuth: [] }],
        body: refreshRequestSchema,
        response: {
          200: withResponseDescription(
            logoutResponseSchema,
            'OK: the refresh token was revoked. The response omits data.',
          ),
          400: withResponseDescription(
            authFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(
            authFailureResponseSchema,
            'UNAUTHORIZED: invalid access token; or AUTH_INVALID_REFRESH_TOKEN: unknown or already revoked refresh token.',
          ),
          500: withResponseDescription(
            authFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      await authService.logout(request.body)
      reply.code(200).send(successEnvelope({ path: requestPath(request) }))
    },
  )

  app.get(
    '/api/auth/me',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'me',
        tags: ['Auth'],
        summary: 'Get the current user',
        description:
          'Available to every authenticated role. Re-reads the account identified by the access token and returns its current username, display name, role, and status without a password hash. A missing account returns UNAUTHORIZED; a disabled account returns AUTH_ACCOUNT_DISABLED. Use this endpoint to restore frontend session information.',
        security: [{ bearerAuth: [] }],
        response: {
          200: withResponseDescription(
            meResponseSchema,
            'OK: data contains freshly loaded public details for the current user.',
          ),
          401: withResponseDescription(
            authFailureResponseSchema,
            'UNAUTHORIZED: invalid access token or the account referenced by the token no longer exists.',
          ),
          403: withResponseDescription(
            authFailureResponseSchema,
            'AUTH_ACCOUNT_DISABLED: the current account is disabled.',
          ),
          500: withResponseDescription(
            authFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const user = await authService.getCurrentUser(request.user!.id)
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: user }))
    },
  )
}
