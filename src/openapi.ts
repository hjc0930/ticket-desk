import { swaggerUI } from '@hono/swagger-ui'
import type { OpenAPIHono } from '@hono/zod-openapi'

import type { AppVariables } from './types.ts'

export const registerOpenApi = (app: OpenAPIHono<{ Variables: AppVariables }>) => {
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'After login, enter data.accessToken in the Swagger Authorize dialog. Enter only the token; Swagger adds the Bearer prefix. Submit refreshToken only in refresh or logout request bodies.',
  })
  app.doc('/openapi.json', {
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
    openapi: '3.1.0',
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
  })
  app.get('/docs', swaggerUI({ url: '/openapi.json' }))
}
