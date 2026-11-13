import { z } from 'zod'

export const successEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    path: z.string().meta({
      description: 'Request pathname, without the origin or query string.',
      example: '/api/tickets',
    }),
    date: z.iso.datetime().meta({
      description: 'UTC ISO 8601 timestamp when the server composes the response.',
      example: '2026-10-12T08:30:00.000Z',
    }),
    message: z.string().meta({
      description:
        'Human-readable outcome description. Detailed failure messages are in errors.message.',
    }),
    code: z.literal('OK').meta({
      description:
        'Stable business code. Success is always OK; interpret failures together with the HTTP status.',
    }),
    data: dataSchema.optional().nullable().meta({
      description:
        'Business payload. May be null or omitted for operations without a payload. Mutually exclusive with errors.',
    }),
  })

// Envelope for mutations that return no data at all (the `data` key is absent).
export const bareSuccessEnvelopeSchema = z.object({
  path: z.string().meta({
    description: 'Request pathname, without the origin or query string.',
    example: '/api/tickets',
  }),
  date: z.iso.datetime().meta({
    description: 'UTC ISO 8601 timestamp when the server composes the response.',
    example: '2026-10-12T08:30:00.000Z',
  }),
  message: z.string().meta({
    description:
      'Human-readable outcome description. Detailed failure messages are in errors.message.',
  }),
  code: z.literal('OK').meta({
    description:
      'Stable business code. Success is always OK; interpret failures together with the HTTP status.',
  }),
})

export const metaSchema = z.object({
  page: z
    .number()
    .int()
    .positive()
    .meta({ description: 'Page number, starting at 1.', example: 1 }),
  pageSize: z
    .number()
    .int()
    .positive()
    .meta({ description: 'Number of records per page.', example: 20 }),
  total: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: 'Total number of records matching all filters.', example: 42 }),
  totalPages: z.number().int().nonnegative().meta({
    description: 'Total pages: ceil(total/pageSize), or 0 when no records match.',
    example: 3,
  }),
})

// Envelope for list endpoints: `data` is an array and `meta` carries pagination.
export const paginatedEnvelopeSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    path: z.string().meta({
      description: 'Request pathname, without the origin or query string.',
      example: '/api/tickets',
    }),
    date: z.iso.datetime().meta({
      description: 'UTC ISO 8601 timestamp when the server composes the response.',
      example: '2026-10-12T08:30:00.000Z',
    }),
    message: z.string().meta({
      description:
        'Human-readable outcome description. Detailed failure messages are in errors.message.',
    }),
    code: z.literal('OK').meta({
      description:
        'Stable business code. Success is always OK; interpret failures together with the HTTP status.',
    }),
    data: z.array(itemSchema).meta({
      description:
        'Records on the requested page. Always an array; empty results or pages beyond the last page return [].',
    }),
    meta: metaSchema.meta({
      description: 'Pagination metadata alongside data. Present only for paginated lists.',
    }),
  })

export const failureErrorDetailsSchema = z.object({
  message: z.array(z.string()).meta({
    description:
      'Failure detail messages. Validation failures provide one entry per field issue; other failures default to the outcome message.',
  }),
  stack: z.string().optional().meta({
    description:
      'Optional error stack trace. May appear outside production; omitted in production.',
  }),
})

export const failureEnvelopeSchema = z.object({
  path: z.string().meta({
    description: 'Request pathname, without the origin or query string.',
    example: '/api/tickets',
  }),
  date: z.iso.datetime().meta({
    description: 'UTC ISO 8601 timestamp when the server composes the response.',
    example: '2026-10-12T08:30:00.000Z',
  }),
  message: z.string().meta({
    description:
      'Human-readable outcome description. Detailed failure messages are in errors.message.',
  }),
  code: z.string().meta({
    description:
      'Stable business code. Success is always OK; interpret failures together with the HTTP status.',
  }),
  errors: failureErrorDetailsSchema.meta({
    description: 'Failure details. Present only on failure responses.',
  }),
})

/**
 * Attaches a per-status response description. `@fastify/swagger` reads the
 * `x-response-description` key as the OpenAPI response description and strips
 * it from the media schema, so the generated document matches the documented
 * contract without polluting the JSON schema.
 */
export const withResponseDescription = <T extends z.ZodType>(schema: T, description: string): T =>
  schema.meta({ 'x-response-description': description })
