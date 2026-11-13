import { z } from 'zod'

import {
  failureEnvelopeSchema,
  paginatedEnvelopeSchema,
  successEnvelopeSchema,
} from './envelope.ts'
import { paginationQuerySchema } from './pagination.ts'

export const prioritySchema = z
  .enum(['low', 'medium', 'high', 'urgent'])
  .meta({ description: 'Priority: low, medium, high, or urgent.', example: 'medium' })

export const statusSchema = z
  .enum(['pending', 'in_progress', 'resolved', 'closed', 'cancelled'])
  .meta({
    description:
      'Ticket status: pending (awaiting handling), in_progress (being handled), resolved, closed, or cancelled.',
    example: 'pending',
  })

export const publicTicketSchema = z.object({
  id: z.string().meta({
    description: 'Unique resource ID.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
  title: z
    .string()
    .meta({ description: 'Ticket title.', example: 'Cannot log in to the application' }),
  description: z.string().meta({
    description: 'Description text.',
    example: 'Please investigate why I cannot log in.',
  }),
  categoryId: z.string().meta({
    description: 'Ticket category ID. Creation requires an existing, enabled category.',
    example: '00000000-0000-4000-8000-000000000002',
  }),
  priority: prioritySchema.meta({
    description: 'Priority: low, medium, high, or urgent.',
    example: 'medium',
  }),
  status: statusSchema.meta({
    description:
      'Ticket status: pending (awaiting handling), in_progress (being handled), resolved, closed, or cancelled.',
    example: 'pending',
  }),
  requesterId: z.string().meta({
    description:
      'Requester user ID. Defaults to the current user on creation; user cannot submit for another user and list queries always restrict user to their own ID.',
    example: '00000000-0000-4000-8000-000000000003',
  }),
  handlerId: z.string().nullable().meta({
    description:
      'Handler user ID, or null when unassigned. Assignment requires an active agent/admin.',
    example: '00000000-0000-4000-8000-000000000004',
  }),
  // Response payloads carry Date objects; the Zod serializer encodes them to
  // ISO strings and the OpenAPI document renders them as date-time strings.
  createdAt: z.date().meta({
    description: 'Creation time in UTC ISO 8601 format.',
    example: '2026-10-12T08:30:00.000Z',
  }),
  updatedAt: z.date().meta({
    description: 'Last update time in UTC ISO 8601 format.',
    example: '2026-10-12T08:30:00.000Z',
  }),
})

export const createTicketRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).meta({
    description: 'Ticket title, 1-200 characters after trimming.',
    example: 'Cannot log in to the application',
  }),
  description: z.string().min(1).max(5000).meta({
    description: 'Description text, 1-5000 characters.',
    example: 'Please investigate why I cannot log in.',
  }),
  categoryId: z.string().min(1).meta({
    description: 'Ticket category ID. Creation requires an existing, enabled category.',
    example: '00000000-0000-4000-8000-000000000002',
  }),
  priority: prioritySchema.optional().meta({
    description:
      'Optional priority: low, medium, high, or urgent. Defaults to medium on creation; omitted list filters do not restrict priority.',
    example: 'medium',
  }),
  requesterId: z.string().min(1).optional().meta({
    description:
      'Optional requester user ID. Defaults to the current user on creation; user cannot submit for another user and list queries always restrict user to their own ID.',
    example: '00000000-0000-4000-8000-000000000003',
  }),
})

export const ticketListQuerySchema = paginationQuerySchema.extend({
  status: statusSchema.optional().meta({
    description:
      'Ticket status: pending (awaiting handling), in_progress (being handled), resolved, closed, or cancelled.',
    example: 'pending',
  }),
  priority: prioritySchema.optional().meta({
    description:
      'Optional priority: low, medium, high, or urgent. Defaults to medium on creation; omitted list filters do not restrict priority.',
    example: 'medium',
  }),
  categoryId: z.string().min(1).optional().meta({
    description: 'Optional category ID filter. Creation requires an existing, enabled category.',
    example: '00000000-0000-4000-8000-000000000002',
  }),
  requesterId: z.string().min(1).optional().meta({
    description:
      'Optional requester user ID. Defaults to the current user on creation; user cannot submit for another user and list queries always restrict user to their own ID.',
    example: '00000000-0000-4000-8000-000000000003',
  }),
  handlerId: z.string().min(1).optional().meta({
    description: 'Optional handler user ID filter.',
    example: '00000000-0000-4000-8000-000000000004',
  }),
  keyword: z.string().trim().min(1).optional().meta({
    description:
      'Optional non-empty keyword after trimming. Case-insensitive search across ticket title and description.',
    example: 'login',
  }),
  createdFrom: z.iso.datetime().optional().meta({
    description: 'Optional inclusive creation-time lower bound in UTC ISO 8601 format.',
    example: '2026-10-01T00:00:00.000Z',
  }),
  createdTo: z.iso.datetime().optional().meta({
    description: 'Optional inclusive creation-time upper bound in UTC ISO 8601 format.',
    example: '2026-10-31T23:59:59.000Z',
  }),
})

export type TicketListQueryType = z.infer<typeof ticketListQuerySchema>

export const transitionRequestSchema = z.object({
  to: z.enum(['in_progress', 'resolved', 'closed', 'cancelled']).meta({
    description:
      'Target ticket status. Must satisfy current-state and actor-permission rules; cannot return to pending.',
    example: 'resolved',
  }),
})

export const assignRequestSchema = z.object({
  handlerId: z.string().min(1).meta({
    description: 'Handler user ID. The assignment target must be an active agent or admin.',
    example: '00000000-0000-4000-8000-000000000004',
  }),
})

export const ticketResponseSchema = successEnvelopeSchema(publicTicketSchema)

export const ticketListResponseSchema = paginatedEnvelopeSchema(publicTicketSchema)

export const ticketFailureResponseSchema = failureEnvelopeSchema
