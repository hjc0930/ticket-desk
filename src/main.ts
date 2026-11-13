import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from '@fastify/type-provider-zod'
import { fastify, LogController } from 'fastify'

import { logger } from './lib/logger.ts'
import { errorHandler, notFoundHandler } from './middleware/error-handler.ts'
import { generateRequestId, registerRequestContext } from './middleware/request-context.ts'
import { registerSecurityPlugins } from './middleware/security.ts'
import { registerOpenApi } from './openapi.ts'
import { registerAuthRoutes, type AuthRouteDependencies } from './routes/auth.ts'
import { registerHealthRoutes } from './routes/health.ts'
import {
  registerTicketCategoryRoutes,
  type TicketCategoryRouteDependencies,
} from './routes/ticket-categories.ts'
import { registerTicketRoutes, type TicketRouteDependencies } from './routes/tickets.ts'
import { registerUserRoutes, type UserRouteDependencies } from './routes/users.ts'
import type { AppInstance } from './types.ts'

export type AppDependencies = AuthRouteDependencies &
  UserRouteDependencies &
  TicketCategoryRouteDependencies &
  TicketRouteDependencies

export const createApp = async (dependencies: AppDependencies = {}): Promise<AppInstance> => {
  const app = fastify({
    loggerInstance: logger,
    // Request lifecycle logging stays application-owned (onResponse hook).
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: generateRequestId,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  registerRequestContext(app)
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  // Plugins load fully before routes are added: swagger captures routes
  // through its onRoute hook, which must already be installed.
  await registerSecurityPlugins(app)
  await registerOpenApi(app)

  registerHealthRoutes(app)
  registerAuthRoutes(app, dependencies)
  registerUserRoutes(app, dependencies)
  registerTicketCategoryRoutes(app, dependencies)
  registerTicketRoutes(app, dependencies)

  return app
}
