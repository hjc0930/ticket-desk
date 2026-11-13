# OpenAPI Documentation

## Scope

Swagger UI at `/docs` and the generated OpenAPI 3.1 document at `/openapi.json`
must explain the implemented ticket backend in English. Documentation metadata
does not change routing, validation, authorization, status codes, or payloads.
Existing module specs remain the source for business rules; response and paging
conventions remain in `api-response-comment.md` and `pagination.md`.

## Requirements

- Keep the introduction brief: summarize the API scope, authentication setup,
  response envelope, and pagination. Describe detailed permissions, token behavior,
  validation rules, and business errors in the relevant operations and schemas.
- Keep existing tag names and operation IDs stable; describe every tag in English.
- Declare resource routes with Fastify `:id` path parameters; `@fastify/swagger`
  publishes them as OpenAPI `{id}` templates so Swagger UI can substitute path
  parameters. Existing resource-route tests verify compatibility.
- Every operation has an English summary and a description explaining purpose,
  access requirements, defaults, side effects, and relevant business restrictions.
- Document path/query/body fields and response properties with English meanings
  and safe illustrative examples where useful. Examples must never be real secrets.
  Do not change validation to make a documentation example work.
- Document existing success and failure responses with status, business codes,
  and trigger conditions. Include missing guard failures, validation failures for
  request-bearing routes, and generic internal failures using the common schema.
- Explicitly distinguish paginated lists from the unpaginated comment thread,
  public replies from internal notes, and assignment from direct state transitions.
- Describe current implementation precisely: assignment accepts only pending or
  in_progress; transitions to resolved require a handler; password reset and
  logout do not immediately invalidate existing access tokens.

## Verification

Colocated `src/openapi.spec.ts` tests read the generated document through the
Fastify application's `inject()` without a database or listening server. Verify introduction,
tags, all operations, protected-route 401 responses, admin-route 403 responses,
request validation responses, business-error descriptions, and field metadata.
Check that examples conform to their Zod request schemas and existing defaults,
nullability, optionality and token constraints still hold. Existing route and
service tests continue to verify actual success and failure behavior.

Run formatting, linting, type checking, unit tests, and production build before
handoff.
