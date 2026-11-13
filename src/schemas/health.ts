import { z } from 'zod'

import { successEnvelopeSchema } from './envelope.ts'

export const healthResponseSchema = successEnvelopeSchema(
  z.object({
    status: z
      .literal('ok')
      .meta({ description: 'Service liveness indicator; always ok.', example: 'ok' }),
  }),
)
