import { z } from 'zod'

export const pageQuerySchema = z.coerce.number().int().min(1).default(1).meta({
  description:
    'Page number, starting at 1; default 1. Invalid or out-of-range values return VALIDATION_ERROR.',
  example: 1,
})
export const pageSizeQuerySchema = z.coerce.number().int().min(1).max(100).default(20).meta({
  description:
    'Page size, from 1 to 100; default 20. Invalid or out-of-range values return VALIDATION_ERROR.',
  example: 20,
})

export const paginationQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
})

export type PaginationQueryType = z.infer<typeof paginationQuerySchema>
