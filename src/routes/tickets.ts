import { z } from 'zod'

import { paginatedEnvelope, successEnvelope } from '../lib/response.ts'
import { requireAuth, requireRole } from '../middleware/guards.ts'
import { requestPath } from '../middleware/request-context.ts'
import { DrizzleTicketCategoryRepository } from '../repositories/ticket-category-repository.ts'
import type { TicketCategoryRepository } from '../repositories/ticket-category-repository.ts'
import { DrizzleTicketCommentRepository } from '../repositories/ticket-comment-repository.ts'
import type { TicketCommentRepository } from '../repositories/ticket-comment-repository.ts'
import { DrizzleTicketRepository } from '../repositories/ticket-repository.ts'
import type { TicketListFilter, TicketRepository } from '../repositories/ticket-repository.ts'
import { DrizzleUserRepository } from '../repositories/user-repository.ts'
import type { UserRepository } from '../repositories/user-repository.ts'
import { withResponseDescription } from '../schemas/envelope.ts'
import {
  assignRequestSchema,
  createTicketRequestSchema,
  ticketFailureResponseSchema,
  ticketListQuerySchema,
  ticketListResponseSchema,
  ticketResponseSchema,
  transitionRequestSchema,
} from '../schemas/ticket.ts'
import type { TicketListQueryType } from '../schemas/ticket.ts'
import {
  commentFailureResponseSchema,
  commentListResponseSchema,
  commentResponseSchema,
  createCommentRequestSchema,
} from '../schemas/ticket-comment.ts'
import { createTicketAssignmentService } from '../services/ticket-assignment.ts'
import { createTicketCommentService } from '../services/ticket-comment.ts'
import { createTicketStateMachine } from '../services/ticket-state-machine.ts'
import { createTicketService, type ActorContext } from '../services/ticket.ts'
import type { AppInstance } from '../types.ts'

export type TicketRouteDependencies = {
  ticketRepository?: TicketRepository
  ticketCategoryRepository?: TicketCategoryRepository
  ticketCommentRepository?: TicketCommentRepository
  userRepository?: UserRepository
}

const idParamSchema = z.object({
  id: z.string().min(1).meta({
    description: 'Target ticket ID, as returned by a ticket creation or query operation.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
})

const UNAUTHORIZED_DESCRIPTION =
  'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.'

const actorFrom = (request: {
  user?: { id: string; role: ActorContext['role'] }
}): ActorContext => {
  if (!request.user) throw new Error('authenticated request missing user decoration')
  return { userId: request.user.id, role: request.user.role }
}

const toFilter = (query: TicketListQueryType): TicketListFilter => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.status !== undefined ? { status: query.status } : {}),
  ...(query.priority !== undefined ? { priority: query.priority } : {}),
  ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
  ...(query.requesterId !== undefined ? { requesterId: query.requesterId } : {}),
  ...(query.handlerId !== undefined ? { handlerId: query.handlerId } : {}),
  ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
  ...(query.createdFrom !== undefined ? { createdFrom: new Date(query.createdFrom) } : {}),
  ...(query.createdTo !== undefined ? { createdTo: new Date(query.createdTo) } : {}),
})

export const registerTicketRoutes = (
  app: AppInstance,
  dependencies: TicketRouteDependencies = {},
) => {
  const ticketRepository = dependencies.ticketRepository ?? new DrizzleTicketRepository()
  const ticketCategoryRepository =
    dependencies.ticketCategoryRepository ?? new DrizzleTicketCategoryRepository()
  const ticketCommentRepository =
    dependencies.ticketCommentRepository ?? new DrizzleTicketCommentRepository()
  const userRepository = dependencies.userRepository ?? new DrizzleUserRepository()

  const ticketService = createTicketService({ ticketRepository, ticketCategoryRepository })
  const stateMachine = createTicketStateMachine({ ticketRepository })
  const assignmentService = createTicketAssignmentService({
    ticketRepository,
    userRepository,
  })
  const commentService = createTicketCommentService({ ticketRepository, ticketCommentRepository })

  app.post(
    '/api/tickets',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'createTicket',
        tags: ['Tickets'],
        summary: 'Create a ticket',
        description:
          'Available to every authenticated role. categoryId must reference an existing, enabled category. priority defaults to medium. requesterId defaults to the current user; user can only create tickets for themselves, while agent/admin may submit on behalf of another user. New tickets have status=pending and handlerId=null. Returns the ticket with HTTP 200.',
        security: [{ bearerAuth: [] }],
        body: createTicketRequestSchema,
        response: {
          200: withResponseDescription(
            ticketResponseSchema,
            'OK: data contains the created ticket with status pending and no handler.',
          ),
          400: withResponseDescription(
            ticketFailureResponseSchema,
            'VALIDATION_ERROR: invalid request fields; or INVALID_CATEGORY: the category does not exist or is disabled.',
          ),
          401: withResponseDescription(ticketFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            ticketFailureResponseSchema,
            'FORBIDDEN: a user attempted to submit a ticket for another user.',
          ),
          500: withResponseDescription(
            ticketFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const body = request.body
      const ticket = await ticketService.create(
        {
          title: body.title,
          description: body.description,
          categoryId: body.categoryId,
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          ...(body.requesterId !== undefined ? { requesterId: body.requesterId } : {}),
        },
        actorFrom(request),
      )
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: ticket }))
    },
  )

  app.get(
    '/api/tickets',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'listTickets',
        tags: ['Tickets'],
        summary: 'Search tickets with pagination',
        description:
          'Available to every authenticated role. For user, requesterId is always overridden with the current user ID, limiting results to their own tickets. agent/admin can query all tickets. Filters include status, priority, category, requester, handler, and creation time range. keyword matches title or description case-insensitively. Filters apply together and time boundaries are inclusive. Results are ordered by creation time descending; data contains the array and meta contains pagination details.',
        security: [{ bearerAuth: [] }],
        querystring: ticketListQuerySchema,
        response: {
          200: withResponseDescription(
            ticketListResponseSchema,
            'OK: data contains visible tickets and meta contains pagination details.',
          ),
          400: withResponseDescription(
            ticketFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(ticketFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          500: withResponseDescription(
            ticketFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const query = request.query
      const { items, total } = await ticketService.list(toFilter(query), actorFrom(request))
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
    '/api/tickets/:id',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'getTicket',
        tags: ['Tickets'],
        summary: 'Get ticket details',
        description:
          'Available to every authenticated role. user can only read their own tickets; agent/admin can read any ticket. Returns ticket fields, related resource IDs, and timestamps. Comments are retrieved through the separate comments endpoint.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: withResponseDescription(
            ticketResponseSchema,
            'OK: data contains the ticket details.',
          ),
          400: withResponseDescription(
            ticketFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(ticketFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            ticketFailureResponseSchema,
            'FORBIDDEN: a user attempted to read a ticket belonging to another user.',
          ),
          404: withResponseDescription(
            ticketFailureResponseSchema,
            'TICKET_NOT_FOUND: the ticket does not exist.',
          ),
          500: withResponseDescription(
            ticketFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const ticket = await ticketService.get(request.params.id, actorFrom(request))
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: ticket }))
    },
  )

  app.post(
    '/api/tickets/:id/transition',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'transitionTicket',
        tags: ['Tickets'],
        summary: 'Transition ticket status',
        description:
          'Requires authentication. The server reads the current status. Allowed transitions: pending to in_progress/cancelled; in_progress to resolved/cancelled; resolved to closed/in_progress. closed and cancelled are terminal. pending to in_progress and in_progress to resolved require agent/admin. Cancelling, confirming closure, and reopening require the requester or admin. Resolving requires an assigned handlerId. Every successful transition atomically updates the status and appends an audit event. A direct transition to in_progress does not assign a handler; use the assign endpoint for assignment.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: transitionRequestSchema,
        response: {
          200: withResponseDescription(
            ticketResponseSchema,
            'OK: data contains the updated ticket; the status and audit event were committed.',
          ),
          400: withResponseDescription(
            ticketFailureResponseSchema,
            'VALIDATION_ERROR: invalid request fields; or INVALID_STATE_TRANSITION: illegal transition, concurrent status change, or resolving without an assigned handler.',
          ),
          401: withResponseDescription(ticketFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            ticketFailureResponseSchema,
            'FORBIDDEN: the role or requester identity does not permit this transition.',
          ),
          404: withResponseDescription(
            ticketFailureResponseSchema,
            'TICKET_NOT_FOUND: the ticket does not exist.',
          ),
          500: withResponseDescription(
            ticketFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const ticket = await stateMachine.transition({
        ticketId: id,
        to: request.body.to,
        actor: actorFrom(request),
      })
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: ticket }))
    },
  )

  app.post(
    '/api/tickets/:id/assign',
    {
      onRequest: [requireAuth, requireRole('admin')],
      schema: {
        operationId: 'assignTicket',
        tags: ['Tickets'],
        summary: 'Assign or replace a ticket handler (admin)',
        description:
          'Requires admin. handlerId must reference an active agent or admin. Assigning a pending ticket moves it to in_progress and atomically records a status event. Assigning an in_progress ticket only changes its handler. Tickets in resolved, closed, or cancelled cannot be assigned. Returns the updated ticket.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: assignRequestSchema,
        response: {
          200: withResponseDescription(
            ticketResponseSchema,
            'OK: data contains the assigned ticket; pending tickets move to in_progress.',
          ),
          400: withResponseDescription(
            ticketFailureResponseSchema,
            'VALIDATION_ERROR: invalid fields; INVALID_HANDLER: missing or disabled handler, or user role; INVALID_STATE_TRANSITION: the ticket is not pending/in_progress or its status changed.',
          ),
          401: withResponseDescription(ticketFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            ticketFailureResponseSchema,
            'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
          ),
          404: withResponseDescription(
            ticketFailureResponseSchema,
            'TICKET_NOT_FOUND: the ticket does not exist.',
          ),
          500: withResponseDescription(
            ticketFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const ticket = await assignmentService.assign({
        ticketId: id,
        handlerId: request.body.handlerId,
        actor: actorFrom(request),
      })
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: ticket }))
    },
  )

  app.post(
    '/api/tickets/:id/comments',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'addTicketComment',
        tags: ['Tickets'],
        summary: 'Add a public reply or internal note',
        description:
          'Available to every authenticated role. body is plain text containing 1-5000 characters and kind defaults to public. user can post public replies only on their own tickets. agent/admin can post public or internal comments on any ticket. The author is the current user. Comments are append-only and cannot be edited or deleted. Comments are currently allowed on closed and cancelled tickets.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: createCommentRequestSchema,
        response: {
          200: withResponseDescription(
            commentResponseSchema,
            'OK: data contains the created comment.',
          ),
          400: withResponseDescription(
            commentFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(commentFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            commentFailureResponseSchema,
            'FORBIDDEN: a user attempted to comment on a ticket belonging to another user or create an internal note.',
          ),
          404: withResponseDescription(
            commentFailureResponseSchema,
            'TICKET_NOT_FOUND: the ticket does not exist.',
          ),
          500: withResponseDescription(
            commentFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const body = request.body
      const comment = await commentService.addComment({
        ticketId: id,
        body: body.body,
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        actor: actorFrom(request),
      })
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: comment }))
    },
  )

  app.get(
    '/api/tickets/:id/comments',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'listTicketComments',
        tags: ['Tickets'],
        summary: 'List ticket comments',
        description:
          'Available to every authenticated role. Returns the complete visible comment array in creation-time ascending order, without pagination or meta. user can read only public comments on their own tickets. agent/admin can read public and internal comments on any ticket. No comments return data=[].',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: withResponseDescription(
            commentListResponseSchema,
            'OK: data contains visible comments in chronological order, without pagination.',
          ),
          400: withResponseDescription(
            commentFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(commentFailureResponseSchema, UNAUTHORIZED_DESCRIPTION),
          403: withResponseDescription(
            commentFailureResponseSchema,
            'FORBIDDEN: a user attempted to read comments on a ticket belonging to another user.',
          ),
          404: withResponseDescription(
            commentFailureResponseSchema,
            'TICKET_NOT_FOUND: the ticket does not exist.',
          ),
          500: withResponseDescription(
            commentFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const comments = await commentService.listComments({
        ticketId: request.params.id,
        actor: actorFrom(request),
      })
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: comments }))
    },
  )
}
