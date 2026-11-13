import cors from '@fastify/cors'
import helmet from '@fastify/helmet'

import { corsOrigins } from '../config/env.ts'
import type { AppInstance } from '../types.ts'

/** Security headers on every response and CORS restricted to the configured origins. */
export const registerSecurityPlugins = async (app: AppInstance) => {
  await app.register(helmet)
  await app.register(cors, {
    origin: (origin, callback) =>
      origin !== undefined && corsOrigins.includes(origin)
        ? callback(null, true)
        : callback(null, false),
  })
}
