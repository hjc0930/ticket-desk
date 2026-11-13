# API Response Comment

Single source of truth for every API response shape in this service. Issued 2026-09-24. Supersedes the response shapes described in `0001-project-baseline.md` ("API conventions") and in module specs drafted before this date.

**Referencing rule:** module specs and top-level specs must reference this file (for example: "responses follow `common/api-response-comment.md`") and must not restate the envelope fields. A module spec only documents its endpoint-specific `data` payloads and error codes.

## Scope

- Applies to **every JSON response** of the service, success and failure alike, including `GET /health`.
- Exempt: `GET /docs` (HTML Swagger UI) and `GET /openapi.json` (the contract document itself).
- All envelope responses use `Content-Type: application/json`.

## Envelope definition

| Field     | Presence               | Type     | Rule                                                                                                                                                                                                      |
| --------- | ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`    | always                 | `string` | The request's API path (pathname only, no scheme/host, no query string). Server-derived from the request URL; never echoed from client input.                                                             |
| `date`    | always                 | `string` | The server's UTC time in ISO 8601 with millisecond precision, e.g. `2026-09-24T08:30:00.000Z` (`Date.toISOString()`), taken when the server composes the response.                                        |
| `message` | always                 | `string` | Human-readable description of the outcome. Safe for clients; never contains internals, stack traces, or sensitive values.                                                                                 |
| `code`    | always                 | `string` | Business status code. Stable, machine-readable, `UPPER_SNAKE_CASE`. Success is always `OK`; failure codes are defined per module (e.g. `AUTH_INVALID_CREDENTIALS`, `VALIDATION_ERROR`, `INTERNAL_ERROR`). |
| `data`    | success only, optional | any      | The response payload. Present with `null` when the requested resource legitimately has no data. Omitted entirely for create/update/delete-style operations that return nothing. Never present on failure. |
| `errors`  | failure only           | `object` | Failure details: `{ "message": string[], "stack"?: string }`. See rules below. Never present on success.                                                                                                  |

`data` and `errors` are mutually exclusive. A failure response always includes `errors`; a success response includes `data` only when there is something to return.

## Failure response rules

- `errors.message` is a **string array**. For validation failures it lists one entry per field issue, e.g. `"username: must match /^[a-z0-9_-]{3,32}$/"`. For failures without field-level details it defaults to a single entry repeating the top-level `message`.
- `errors.stack` contains the call stack and is included **only when `NODE_ENV !== 'production'`**. Production responses never contain `stack`, internal messages, or traces.
- Unexpected exceptions render as `code: "INTERNAL_ERROR"` with a generic client-safe `message`; the real cause goes to the server log (correlated by `x-request-id`), and `errors.stack` appears in non-production only.

### Failure examples

Validation failure (400):

```json
{
  "path": "/api/auth/login",
  "date": "2026-09-24T08:30:00.000Z",
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": {
    "message": [
      "username: must match /^[a-z0-9_-]{3,32}$/",
      "password: must be at least 8 characters"
    ],
    "stack": "AppError: VALIDATION_ERROR\n    at validate (src/lib/...)"
  }
}
```

Business failure (401), production build — no `stack`:

```json
{
  "path": "/api/auth/login",
  "date": "2026-09-24T08:30:00.000Z",
  "message": "Invalid username or password",
  "code": "AUTH_INVALID_CREDENTIALS",
  "errors": {
    "message": ["Invalid username or password"]
  }
}
```

## Success response rules

- `code` is `OK`; `message` defaults to `"OK"` (a route may override it with a short operation-specific phrase, e.g. `"Logged in"`).
- Resource exists but is empty → `"data": null`.
- Mutation that returns nothing (e.g. logout) → omit the `data` key entirely; the 200 status plus envelope already communicates success.

### Success examples

Read with payload:

```json
{
  "path": "/api/auth/me",
  "date": "2026-09-24T08:30:00.000Z",
  "message": "OK",
  "code": "OK",
  "data": { "id": "0b6b0d6a-...", "username": "admin", "role": "admin" }
}
```

Read with no data:

```json
{
  "path": "/api/tickets/44f2...",
  "date": "2026-09-24T08:30:00.000Z",
  "message": "OK",
  "code": "OK",
  "data": null
}
```

Mutation without payload (logout):

```json
{
  "path": "/api/auth/logout",
  "date": "2026-09-24T08:30:00.000Z",
  "message": "OK",
  "code": "OK"
}
```

## Request ID

`requestId` is **not** part of the envelope body. It remains available to clients via the `x-request-id` response header (supplied by the request-context hook) and is used for server-side log correlation. If a client sends `x-request-id` (≤ 128 chars), that value is honored, per the existing request-context behavior.

## Implementation mapping

| Piece                                        | Responsibility                                                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/response.ts` (+ `response.spec.ts`) | Envelope builders: `successEnvelope({ path, data?, message? })` and `failureEnvelope({ path, code, message, errorDetails? })`, with `date` stamped internally and `stack` gated on `NODE_ENV` |
| `src/lib/errors.ts`                          | `AppError` stays the single error type; its `code`, `message`, `details` map onto `code`, `message`, `errors.message`                                                                         |
| `src/middleware/error-handler.ts`            | Renders every thrown error as the failure envelope; maps Zod issues to `errors.message`; gates `stack` by environment                                                                         |
| Routes                                       | Compose success responses through `successEnvelope`; `/health` adopts the envelope in the implementing change (breaking)                                                                      |

## Migration impact (breaking)

- Every existing endpoint changes shape, including `/health` (`data.status` survives inside the envelope).
- Error bodies no longer carry `requestId` (moved to header-only).
- All response Zod schemas and OpenAPI definitions must be updated to the envelope in the same implementing change; module specs drafted before 2026-09-24 are updated to reference this file.

## Testing strategy

Colocated unit tests only (no E2E in common specs):

1. Builders: exact field set and ordering-independent deep equality; `date` matches ISO 8601 UTC; `path` strips query strings; `data: null` vs omitted `data`; `errors.message` defaults to `[message]`.
2. Error handler: `AppError` renders the failure envelope with the right `code`/`message`/`errors.message`; unexpected error → `INTERNAL_ERROR` with generic message; `stack` present when `NODE_ENV` is `test`/`development`, absent when `production`.
3. Validation: Zod issues produce one `errors.message` entry per field.
4. Route conformance: at least one route per module asserts its 2xx and 4xx bodies against the envelope schemas (OpenAPI-validated).

## Acceptance criteria

- Every JSON response of the service matches the envelope; no response contains both `data` and `errors`, and no failure lacks `errors`.
- `errors.stack` never appears in production responses; `message` is always client-safe.
- OpenAPI response schemas describe the envelope; the OpenAPI document validates.
- Quality gates (format, lint, typecheck, unit tests, build) pass in the implementing change.

## Open questions

- Pagination: where `meta` (page/total) lives — a top-level optional `meta` sibling of `data`, or inside `data`. Decided by the first paginated module spec (see 0002 Phase 2).
- Per-operation success codes (e.g. `TICKET_CREATED`) instead of uniform `OK` — deferred; uniform `OK` unless a consumer needs finer signal.
- Whether `date` should be request-arrival time instead of response-composition time — current choice is response-composition; either is acceptable to clients, revisit only if timing precision matters.
