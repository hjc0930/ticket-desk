import { successEnvelope } from '../lib/response.ts'
import { requestPath } from '../middleware/request-context.ts'
import { healthResponseSchema } from '../schemas/health.ts'
import { withResponseDescription } from '../schemas/envelope.ts'
import type { AppInstance } from '../types.ts'

export const registerHealthRoutes = (app: AppInstance) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Check service liveness',
        description:
          'Public endpoint; no authentication is required. data.status=ok indicates that the HTTP service can respond. It does not connect to or probe the database and does not indicate external dependency health. Suitable for a liveness probe.',
        security: [],
        response: {
          200: withResponseDescription(
            healthResponseSchema,
            'OK: the HTTP service is available; data.status is always ok.',
          ),
        },
      },
    },
    async (request, reply) => {
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: { status: 'ok' } }))
    },
  )
}
