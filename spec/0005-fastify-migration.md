# 0005: Fastify Framework Migration

## Status

Completed.

## Background

The HTTP layer was built on Hono 4 with `@hono/zod-openapi`, `@hono/node-server`, and `@hono/swagger-ui`. On 2026-11-13 the decision was made to migrate the HTTP framework to Fastify 5. The business modules (services, repositories, database, schemas) are framework-independent and stay unchanged. The migration runs on the `feat/fastify-migration` branch as a single-swing migration with staged commits; Hono and Fastify are not run side by side.

## Goals

- Replace the HTTP framework while preserving every public API contract: paths, methods, status codes, envelope bodies, error codes, the `x-request-id` header behavior, pagination, and the OpenAPI 3.1 document semantics.
- Keep Zod as the single validation source. Fastify routes validate through `@fastify/type-provider-zod` (which requires Zod ≥ 4.2; the project pins 4.4.3), and the Zod schemas in `src/schemas/` are reused as-is.
- Keep the same quality gates and coverage level. Route and middleware tests move from `app.request()` to `app.inject()`; E2E tests keep a real listener on an ephemeral loopback port.

## Non-goals

- No public API, database, service, or repository changes.
- No web application changes; `webapp/` consumes the REST contract unchanged.
- No dual-framework transition period and no parallel Hono runtime.

## Decisions

| Concern               | Decision                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation and typing | `@fastify/type-provider-zod`; Zod schemas remain the single source in `src/schemas/`.                                                                                                                                                        |
| OpenAPI and docs      | `@fastify/swagger` (OpenAPI 3.1) plus `@fastify/swagger-ui` at `/openapi.json` and `/docs`. Route metadata (operationId, tags, summary, description, security, per-status response descriptions) is declared on Fastify route schemas.       |
| Auth guards           | `requireAuth` runs as an `onRequest` hook and decorates the request with the authenticated user; `requireRole` is a `preHandler` factory with explicit role allow-lists (no implicit hierarchy).                                             |
| Request context       | Request IDs come from Fastify's `genReqId` (honoring an inbound `x-request-id` of at most 128 characters) and are echoed on the reply; access logs keep the existing fields through an `onResponse` hook.                                    |
| Error handling        | `setErrorHandler` maps `ZodError` and `AppError` to the failure envelope; `setNotFoundHandler` returns the envelope 404. Fastify-native body-parse and validation failures are reshaped to `VALIDATION_ERROR` with `field: message` details. |
| CORS and headers      | `@fastify/cors` with an allow-list reflection callback over `CORS_ORIGINS`; `@fastify/helmet` for security headers. Header sets are not part of the public API contract.                                                                     |
| Logging               | The existing Pino instance is passed to Fastify via `loggerInstance`; request lifecycle logging stays application-owned instead of Fastify's built-in request logging.                                                                       |
| Startup and shutdown  | `listenOnFirstAvailablePort` is reimplemented on `fastify.listen` and keeps the EADDRINUSE port scanning through 65535; shutdown drains HTTP via `app.close()` before database closure.                                                      |

## Contract baseline and equivalence gate

Before the migration, the Hono stack's `/openapi.json` is exported and committed as a baseline fixture under `test/fixtures/`. After the migration, the Fastify-generated document is compared against that baseline; every difference is either fixed or explicitly accepted as a benign rendering difference in the migration change. The route tests and the E2E suite remain the behavioral gate for actual request/response parity.

## Verification

- All existing quality gates pass unchanged: `format:check`, `lint`, `typecheck`, unit tests, E2E tests, `build`, and the webapp build.
- `pnpm dev` boots; `/health`, `/openapi.json`, `/docs`, login, and ticket flows work through the webapp development proxy.
- Envelope shapes, error codes, pagination fields, and `x-request-id` behavior stay identical to the pre-migration behavior.

## Implementation record

Completed on 2026-11-13:

- Zod metadata moved from the `@hono/zod-openapi` `.openapi()` extension to Zod 4's native `.meta()`; descriptions, singular `example`, and `writeOnly` pass through to the generated document verbatim.
- Per-status response descriptions ride on `x-response-description` metadata, which `@fastify/swagger` reads as the response description and strips from the media schema.
- The document transform keeps the pre-migration rendering: `date-time` fields carry no pattern, objects do not pin `additionalProperties: false`, nullable fields render as `nullable: true`, and zod's implicit integer ceiling is omitted.
- Accepted benign renderings (equivalent, not byte-identical, to the baseline): numeric `exclusiveMinimum` instead of the draft-04 `minimum` + `exclusiveMinimum: true` pair, and parameter descriptions on `parameter.description` instead of duplicated inside `parameter.schema.description`. `src/openapi.spec.ts` reads the description from either location.
- Response datetime schemas use `z.date()` (`createdAt`/`updatedAt` on tickets and comments): payloads carry `Date` objects, the Zod serializer encodes them to ISO strings, and the document renders `format: date-time`.
- `lib/access-token.ts` signs and verifies compact HS256 JWTs with `node:crypto`; tokens issued by the previous Hono implementation remain valid.
- `listenOnFirstAvailablePort` accepts an app factory and builds a fresh instance per port attempt, because a Fastify instance cannot serve requests after `close()`. Listening binds `::` explicitly (dual-stack) so occupied ports surface as `EADDRINUSE`, matching the previous Node adapter.
- Guards run as `onRequest` hooks, so authentication failures take precedence over body parsing and validation, matching the previous middleware order.
- All quality gates green: 241 unit tests, 6 E2E tests, lint, typecheck, format, production build, and the webapp build; the generated `/openapi.json` matches the baseline fixture with zero remaining differences after the equivalences above.
