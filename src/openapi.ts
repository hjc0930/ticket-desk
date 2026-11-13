import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import { createJsonSchemaTransform } from '@fastify/type-provider-zod'

import type { AppInstance } from './types.ts'

// Keeps the generated document aligned with the pre-migration contract (spec/0005):
// bare `date-time` fields carried no pattern, objects did not pin
// `additionalProperties`, nullable fields rendered as `nullable: true` instead
// of `anyOf` with a null branch, and zod's implicit integer ceiling did not
// appear. Validation itself is unaffected.
const collapseNullable = (node: Record<string, unknown>) => {
  const branches = node.anyOf
  if (!Array.isArray(branches) || branches.length !== 2) return
  const [value, nullBranch] = branches as [Record<string, unknown>, { type?: unknown }]
  if (!value || typeof value !== 'object' || nullBranch?.type !== 'null') return

  const merged: Record<string, unknown> = { ...value, nullable: true }
  for (const [key, entry] of Object.entries(node)) {
    if (key !== 'anyOf' && !(key in merged)) merged[key] = entry
  }
  for (const key of Object.keys(node)) delete node[key]
  Object.assign(node, merged)
}

const openApiTransform = createJsonSchemaTransform({
  zodToJsonConfig: {
    override: (context) => {
      const jsonSchema = context.jsonSchema as Record<string, unknown>
      if (jsonSchema.format === 'date-time') delete jsonSchema.pattern
      if (jsonSchema.additionalProperties === false) delete jsonSchema.additionalProperties
      if (jsonSchema.maximum === 9_007_199_254_740_991) delete jsonSchema.maximum
      collapseNullable(jsonSchema)
    },
  },
})

export const registerOpenApi = async (app: AppInstance) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Ticket Desk API',
        version: '0.1.0',
        description: [
          'REST API for user management, ticket categories, assignments, status transitions, and comments.',
          'Log in at `POST /api/auth/login` and enter `data.accessToken` in **Authorize** to access protected endpoints.',
          'JSON responses use a common envelope with `code`, `message`, and `data` or `errors`. Paginated lists accept `page` and `pageSize` (default 20, maximum 100).',
          'See each endpoint for permissions, validation rules, and error codes.',
        ].join('\n\n'),
      },
      servers: [{ url: '/', description: 'Current service (same origin as Swagger UI)' }],
      tags: [
        {
          name: 'System',
          description:
            'Public service liveness check. Does not probe the database or external dependencies.',
        },
        {
          name: 'Auth',
          description: 'Credential login, token rotation, logout, and current account information.',
        },
        {
          name: 'Users',
          description:
            'Administrator-only user creation, search, updates, and password reset. Disable accounts instead of deleting them.',
        },
        {
          name: 'Ticket Categories',
          description:
            'Authenticated category queries and administrator-only creation, updates, and disabling.',
        },
        {
          name: 'Tickets',
          description:
            'Ticket creation, search, details, assignment, status transitions, public replies, and internal notes.',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'After login, enter data.accessToken in the Swagger Authorize dialog. Enter only the token; Swagger adds the Bearer prefix. Submit refreshToken only in refresh or logout request bodies.',
          },
        },
      },
    },
    transform: openApiTransform,
  })
  await app.register(swaggerUI, { routePrefix: '/docs' })

  // The public contract exposes the document at /openapi.json.
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger())
}
