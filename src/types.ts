import type { FastifyInstance } from 'fastify'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { Logger } from 'pino'

export type UserRole = 'admin' | 'agent' | 'user'

export type UserStatus = 'active' | 'disabled'

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TicketStatus = 'pending' | 'in_progress' | 'resolved' | 'closed' | 'cancelled'

export type CommentKind = 'public' | 'internal'

export type AuthenticatedUser = {
  id: string
  role: UserRole
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireAuth`; present only on authenticated requests. */
    user?: AuthenticatedUser
  }

  interface FastifySchema {
    /** OpenAPI operation identifier, passed through to the generated document. */
    operationId?: string
  }
}

/** The application Fastify instance with Zod-powered schema inference. */
export type AppInstance = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  Logger,
  ZodTypeProvider
>
