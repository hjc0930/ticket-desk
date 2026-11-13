import { z } from 'zod'

import { paginatedEnvelope, successEnvelope } from '../lib/response.ts'
import { requireAuth, requireRole } from '../middleware/guards.ts'
import { requestPath } from '../middleware/request-context.ts'
import { DrizzleTicketCategoryRepository } from '../repositories/ticket-category-repository.ts'
import type {
  TicketCategoryListFilter,
  TicketCategoryPatch,
  TicketCategoryRepository,
} from '../repositories/ticket-category-repository.ts'
import { withResponseDescription } from '../schemas/envelope.ts'
import {
  createTicketCategoryRequestSchema,
  ticketCategoryFailureResponseSchema,
  ticketCategoryListQuerySchema,
  ticketCategoryListResponseSchema,
  ticketCategoryResponseSchema,
  updateTicketCategoryRequestSchema,
} from '../schemas/ticket-category.ts'
import type { TicketCategoryListQueryType } from '../schemas/ticket-category.ts'
import { createTicketCategoryService } from '../services/ticket-category.ts'
import type { AppInstance } from '../types.ts'

export type TicketCategoryRouteDependencies = {
  ticketCategoryRepository?: TicketCategoryRepository
}

const idParamSchema = z.object({
  id: z.string().min(1).meta({
    description: 'Target category ID, as returned by a category creation or query operation.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
})

const UNAUTHORIZED_DESCRIPTION =
  'UNAUTHORIZED: missing Bearer access token, invalid token format or signature, or expired token.'

const toFilter = (query: TicketCategoryListQueryType): TicketCategoryListFilter => ({
  page: query.page,
  pageSize: query.pageSize,
  ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
  ...(query.keyword !== undefined ? { keyword: query.keyword } : {}),
})

export const registerTicketCategoryRoutes = (
  app: AppInstance,
  dependencies: TicketCategoryRouteDependencies = {},
) => {
  const service = createTicketCategoryService({
    ticketCategoryRepository:
      dependencies.ticketCategoryRepository ?? new DrizzleTicketCategoryRepository(),
  })

  app.post(
    '/api/ticket-categories',
    {
      onRequest: [requireAuth, requireRole('admin')],
      schema: {
        operationId: 'createTicketCategory',
        tags: ['Ticket Categories'],
        summary: 'Create a ticket category (admin)',
        description:
          'Requires admin. The name must be unique and contain 1-64 characters after trimming. description is optional and stored as null when omitted. New categories are enabled by default. Returns the created category.',
        security: [{ bearerAuth: [] }],
        body: createTicketCategoryRequestSchema,
        response: {
          200: withResponseDescription(
            ticketCategoryResponseSchema,
            'OK: data contains the created category with enabled=true.',
          ),
          400: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            UNAUTHORIZED_DESCRIPTION,
          ),
          403: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
          ),
          409: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'CATEGORY_NAME_TAKEN: the category name is already in use.',
          ),
          500: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const body = request.body
      const category = await service.create({
        name: body.name,
        description: body.description ?? null,
      })
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: category }))
    },
  )

  app.get(
    '/api/ticket-categories',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'listTicketCategories',
        tags: ['Ticket Categories'],
        summary: 'List ticket categories with pagination',
        description:
          'Available to every authenticated role. Results are ordered by creation time ascending. Omitting enabled includes both enabled and disabled categories. Supports enabled filtering and a case-insensitive keyword search across name and description. data contains the category array and meta contains pagination details.',
        security: [{ bearerAuth: [] }],
        querystring: ticketCategoryListQuerySchema,
        response: {
          200: withResponseDescription(
            ticketCategoryListResponseSchema,
            'OK: data contains the category array and meta contains pagination details.',
          ),
          400: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            UNAUTHORIZED_DESCRIPTION,
          ),
          500: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const query = request.query
      const { items, total } = await service.list(toFilter(query))
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
    '/api/ticket-categories/:id',
    {
      onRequest: requireAuth,
      schema: {
        operationId: 'getTicketCategory',
        tags: ['Ticket Categories'],
        summary: 'Get ticket category details',
        description:
          'Available to every authenticated role. Returns the category name, description, and enabled flag by ID. Disabled categories remain readable. A missing category returns CATEGORY_NOT_FOUND.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: withResponseDescription(
            ticketCategoryResponseSchema,
            'OK: data contains the requested category.',
          ),
          400: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            UNAUTHORIZED_DESCRIPTION,
          ),
          404: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'CATEGORY_NOT_FOUND: the category does not exist.',
          ),
          500: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const category = await service.get(request.params.id)
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: category }))
    },
  )

  app.patch(
    '/api/ticket-categories/:id',
    {
      onRequest: [requireAuth, requireRole('admin')],
      schema: {
        operationId: 'updateTicketCategory',
        tags: ['Ticket Categories'],
        summary: 'Update or disable a ticket category (admin)',
        description:
          'Requires admin. Partially updates name, description, or enabled; at least one defined field is required. Omitted fields remain unchanged and description=null clears the description. Names must be unique. Disabled categories cannot be used for new tickets; existing tickets retain their category reference. There is no physical deletion endpoint.',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: updateTicketCategoryRequestSchema,
        response: {
          200: withResponseDescription(
            ticketCategoryResponseSchema,
            'OK: data contains the updated category.',
          ),
          400: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'VALIDATION_ERROR: request fields violate their constraints; see errors.message for details.',
          ),
          401: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            UNAUTHORIZED_DESCRIPTION,
          ),
          403: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'FORBIDDEN: the current role cannot perform this operation or access the target resource.',
          ),
          404: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'CATEGORY_NOT_FOUND: the category does not exist.',
          ),
          409: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'CATEGORY_NAME_TAKEN: another category already uses the requested name.',
          ),
          500: withResponseDescription(
            ticketCategoryFailureResponseSchema,
            'INTERNAL_ERROR: unexpected server failure. Use the x-request-id response header when requesting support.',
          ),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const body = request.body
      const patch: TicketCategoryPatch = {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      }
      const category = await service.update(id, patch)
      reply.code(200).send(successEnvelope({ path: requestPath(request), data: category }))
    },
  )
}
