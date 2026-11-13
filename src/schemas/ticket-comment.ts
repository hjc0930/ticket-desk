import { z } from 'zod'

import { failureEnvelopeSchema, successEnvelopeSchema } from './envelope.ts'

export const publicCommentSchema = z.object({
  id: z.string().meta({
    description: 'Unique resource ID.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
  ticketId: z.string().meta({
    description: 'ID of the ticket containing this comment.',
    example: '00000000-0000-4000-8000-000000000001',
  }),
  authorId: z.string().meta({
    description: 'Comment author ID, derived from the authenticated user.',
    example: '00000000-0000-4000-8000-000000000003',
  }),
  body: z.string().meta({
    description: 'Plain-text comment body, 1-5000 characters.',
    example: 'I have added details about the issue. Please investigate.',
  }),
  kind: z.enum(['public', 'internal']).meta({
    description:
      'Comment kind: public (requester-visible reply) or internal (staff note). Users can read and write only public comments.',
    example: 'public',
  }),
  // Response payloads carry Date objects; the Zod serializer encodes them to
  // ISO strings and the OpenAPI document renders them as date-time strings.
  createdAt: z.date().meta({
    description: 'Creation time in UTC ISO 8601 format.',
    example: '2026-10-12T08:30:00.000Z',
  }),
})

export const createCommentRequestSchema = z.object({
  body: z.string().min(1).max(5000).meta({
    description: 'Plain-text comment body, 1-5000 characters.',
    example: 'I have added details about the issue. Please investigate.',
  }),
  kind: z.enum(['public', 'internal']).optional().meta({
    description:
      'Optional comment kind; defaults to public. internal notes are available only to agent/admin.',
    example: 'public',
  }),
})

export const commentResponseSchema = successEnvelopeSchema(publicCommentSchema)

export const commentListResponseSchema = successEnvelopeSchema(z.array(publicCommentSchema))

export const commentFailureResponseSchema = failureEnvelopeSchema
