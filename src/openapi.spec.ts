import { z } from 'zod'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from './main.ts'
import { loginRequestSchema, refreshRequestSchema } from './schemas/auth.ts'
import {
  createUserRequestSchema,
  resetPasswordRequestSchema,
  updateUserRequestSchema,
  userListQuerySchema,
} from './schemas/user.ts'
import {
  createTicketCategoryRequestSchema,
  ticketCategoryListQuerySchema,
  updateTicketCategoryRequestSchema,
} from './schemas/ticket-category.ts'
import {
  assignRequestSchema,
  createTicketRequestSchema,
  ticketListQuerySchema,
  transitionRequestSchema,
} from './schemas/ticket.ts'
import { createCommentRequestSchema } from './schemas/ticket-comment.ts'

type SchemaType = {
  description?: string
  example?: unknown
  default?: unknown
  required?: string[]
  properties?: Record<string, SchemaType>
  items?: SchemaType
  anyOf?: SchemaType[]
  allOf?: SchemaType[]
  oneOf?: SchemaType[]
}
type OperationType = {
  summary: string
  description: string
  operationId?: string
  tags: string[]
  security: Record<string, string[]>[]
  parameters?: { name: string; description?: string; schema: SchemaType }[]
  requestBody?: { content: { 'application/json': { schema: SchemaType } } }
  responses: Record<
    string,
    {
      description: string
      content: { 'application/json': { schema: SchemaType } }
    }
  >
}
type DocumentType = {
  info: { description: string }
  servers: { url: string }[]
  tags: { name: string; description: string }[]
  paths: Record<string, Record<string, OperationType>>
}

const english = /[A-Za-z]/
const bodySchema = (operation: OperationType) =>
  operation.requestBody!.content['application/json'].schema
const responseSchema = (operation: OperationType, status = '200') =>
  operation.responses[status]!.content['application/json'].schema

describe('OpenAPI documentation', () => {
  let document: DocumentType

  beforeAll(async () => {
    const response = await (await createApp()).inject({ method: 'GET', url: '/openapi.json' })
    expect(response.statusCode).toBe(200)
    document = (await response.json()) as DocumentType
  })

  it('provides a brief introduction and describes all module groups', () => {
    for (const topic of ['Authorize', '/api/auth/login', 'data.accessToken', 'pageSize']) {
      expect(document.info.description).toContain(topic)
    }
    expect(JSON.stringify(document)).not.toMatch(/[\u4e00-\u9fff]/)
    expect(document.servers).toEqual([expect.objectContaining({ url: '/' })])
    expect(document.tags.map((tag) => tag.name)).toEqual([
      'System',
      'Auth',
      'Users',
      'Ticket Categories',
      'Tickets',
    ])
    for (const tag of document.tags) expect(tag.description).toMatch(english)
  })

  it('describes every operation, parameter and response including missing guard failures', () => {
    const operations = Object.values(document.paths).flatMap((path) => Object.values(path))
    expect(operations).toHaveLength(21)
    for (const operation of operations) {
      expect(operation.summary).toMatch(english)
      expect(operation.description.length).toBeGreaterThan(40)
      expect(operation.tags.every((tag) => document.tags.some((group) => group.name === tag))).toBe(
        true,
      )
      if (operation.security.some((scheme) => 'bearerAuth' in scheme)) {
        expect(operation.responses['401']?.description).toContain('UNAUTHORIZED')
      }
      if (operation.summary.includes('(admin)')) {
        expect(operation.responses['403']?.description).toContain('FORBIDDEN')
      }
      if (operation.requestBody || operation.parameters?.length) {
        expect(operation.responses['400']?.description).toContain('VALIDATION_ERROR')
      }
      if (operation.tags[0] !== 'System') {
        expect(operation.responses['500']?.description).toContain('INTERNAL_ERROR')
      }
      for (const response of Object.values(operation.responses)) {
        expect(response.description).toMatch(english)
        expect(response.description).not.toContain('undefined')
      }
      for (const parameter of operation.parameters ?? []) {
        expect(parameter.description ?? parameter.schema?.description, parameter.name).toMatch(
          english,
        )
      }
    }
  })

  it('documents all request and response properties, including nested envelopes', () => {
    const inspect = (schema: SchemaType) => {
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        expect(property.description, name).toMatch(english)
        inspect(property)
      }
      if (schema.items) inspect(schema.items)
      for (const branch of [
        ...(schema.anyOf ?? []),
        ...(schema.allOf ?? []),
        ...(schema.oneOf ?? []),
      ])
        inspect(branch)
    }
    for (const path of Object.values(document.paths)) {
      for (const operation of Object.values(path)) {
        if (operation.requestBody) inspect(bodySchema(operation))
        for (const response of Object.values(operation.responses))
          inspect(response.content['application/json'].schema)
      }
    }
  })

  it('uses substitutable OpenAPI path templates for all resource ID parameters', () => {
    for (const [path, methods] of Object.entries(document.paths)) {
      expect(path).not.toContain(':id')
      for (const operation of Object.values(methods)) {
        const idParameter = operation.parameters?.find((parameter) => parameter.name === 'id')
        if (idParameter) expect(path).toContain('{id}')
        if (path.includes('{id}')) expect(idParameter).toBeDefined()
      }
    }
  })

  it('keeps field examples compatible with their actual request validators', () => {
    const cases: [string, string, z.ZodObject][] = [
      ['/api/auth/login', 'post', loginRequestSchema],
      ['/api/auth/refresh', 'post', refreshRequestSchema],
      ['/api/users', 'post', createUserRequestSchema],
      ['/api/users/{id}', 'patch', updateUserRequestSchema],
      ['/api/users/{id}/reset-password', 'post', resetPasswordRequestSchema],
      ['/api/ticket-categories', 'post', createTicketCategoryRequestSchema],
      ['/api/ticket-categories/{id}', 'patch', updateTicketCategoryRequestSchema],
      ['/api/tickets', 'post', createTicketRequestSchema],
      ['/api/tickets/{id}/transition', 'post', transitionRequestSchema],
      ['/api/tickets/{id}/assign', 'post', assignRequestSchema],
      ['/api/tickets/{id}/comments', 'post', createCommentRequestSchema],
    ]
    for (const [path, method, validator] of cases) {
      for (const [field, property] of Object.entries(
        bodySchema(document.paths[path]![method]!).properties!,
      )) {
        if (property.example !== undefined) {
          expect(
            validator.shape[field]!.safeParse(property.example).success,
            `${path} ${field}`,
          ).toBe(true)
        }
      }
    }
    const lists: [string, z.ZodObject][] = [
      ['/api/users', userListQuerySchema],
      ['/api/ticket-categories', ticketCategoryListQuerySchema],
      ['/api/tickets', ticketListQuerySchema],
    ]
    for (const [path, validator] of lists) {
      const parameters = document.paths[path]!.get!.parameters!
      for (const parameter of parameters) {
        if (parameter.schema.example !== undefined) {
          expect(validator.shape[parameter.name]!.safeParse(parameter.schema.example).success).toBe(
            true,
          )
        }
      }
      expect(parameters.find((parameter) => parameter.name === 'page')!.schema.default).toBe(1)
      expect(parameters.find((parameter) => parameter.name === 'pageSize')!.schema.default).toBe(20)
    }
  })

  it('explains endpoint-specific restrictions and business errors', () => {
    const transition = document.paths['/api/tickets/{id}/transition']!.post!
    expect(transition.description).toContain('requires an assigned handlerId')
    expect(transition.responses['400']!.description).toContain('INVALID_STATE_TRANSITION')
    const assignment = document.paths['/api/tickets/{id}/assign']!.post!
    expect(assignment.description).toContain(
      'Tickets in resolved, closed, or cancelled cannot be assigned',
    )
    expect(assignment.responses['400']!.description).toContain('INVALID_HANDLER')
    expect(document.paths['/api/auth/refresh']!.post!.responses['401']!.description).toContain(
      'all refresh tokens',
    )
    expect(document.paths['/api/users/{id}']!.patch!.responses['403']!.description).toContain(
      'SELF_MODIFICATION_FORBIDDEN',
    )
    expect(document.paths['/api/tickets']!.get!.description).toContain(
      'always overridden with the current user ID',
    )
    const comments = document.paths['/api/tickets/{id}/comments']!.get!
    expect(comments.description).toContain('without pagination')
    expect(comments.description).toContain('internal')
    expect(responseSchema(comments).properties).not.toHaveProperty('meta')
    expect(responseSchema(document.paths['/api/tickets']!.get!).properties).toHaveProperty('meta')
    for (const path of ['/api/auth/logout', '/api/users/{id}/reset-password']) {
      expect(responseSchema(document.paths[path]!.post!).properties).not.toHaveProperty('data')
    }
  })
})
