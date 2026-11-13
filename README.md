# Ticket Desk Backend

Fastify-based ticket system backend with authentication, role-based access control, user management, ticket categories, ticket workflows, comments, and assignment support. See `spec/` for the product roadmap and module contracts.

## Requirements

- Node.js 22.18+, 24.11+, or 26+
- pnpm

## Install

```bash
pnpm install
cp .env.example .env
```

Do not commit `.env`. The database engine is selected by `DATABASE_TYPE` (`postgres` or `pglite`); when `DATABASE_TYPE` is unset, a URL-shaped `DATABASE_URL` selects PostgreSQL and anything else falls back to embedded PGlite under `.data/pglite`. For `pglite`, `DATABASE_URL` is the data directory (or `memory://` for an in-memory database).

## Environment variables

| Name                             | Default       | Description                                                          |
| -------------------------------- | ------------- | -------------------------------------------------------------------- |
| `NODE_ENV`                       | `development` | `development`, `test`, or `production`                               |
| `PORT`                           | `3000`        | HTTP server port                                                     |
| `SHUTDOWN_TIMEOUT_MS`            | `10000`       | Total graceful shutdown timeout in milliseconds                      |
| `LOG_LEVEL`                      | `info`        | Pino log level                                                       |
| `CORS_ORIGINS`                   | empty         | Comma-separated browser origins allowed for `/api/*`                 |
| `DATABASE_TYPE`                  | inferred      | `postgres` or `pglite`; inferred from `DATABASE_URL` when unset      |
| `DATABASE_URL`                   | empty         | PostgreSQL URL, or PGlite data directory when `DATABASE_TYPE=pglite` |
| `JWT_SECRET`                     | empty         | HS256 signing key for access tokens; at least 32 chars               |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS`  | `900`         | Access-token lifetime in seconds                                     |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | `604800`      | Refresh-token lifetime in seconds                                    |
| `AUTH_MAX_LOGIN_FAILURES`        | `5`           | Per-account failed-login threshold                                   |
| `AUTH_LOCKOUT_SECONDS`           | `900`         | Account lockout duration in seconds                                  |
| `AUTH_IP_FAILURE_LIMIT`          | `20`          | Per-IP failed-login threshold                                        |
| `AUTH_IP_WINDOW_SECONDS`         | `900`         | Per-IP failed-login window in seconds                                |

## Database workflow

Drizzle migrations under `drizzle/` are version-controlled project artifacts, not local environment files.

When changing the database schema:

1. Update `src/db/schema.ts`.
2. Run `pnpm run db:generate`.
3. Review the generated SQL under `drizzle/`.
4. Run `pnpm run db:migrate` locally.
5. Commit `src/db/schema.ts`, the generated migration, and its metadata together.

Do not run `db:generate` during application startup, installation, CI builds, or deployment. New developers and deployment environments only run `pnpm run db:migrate` against the reviewed migrations already committed to the repository.

Do not edit a migration that has already been shared or applied. Make the next schema change in `src/db/schema.ts` and generate a new migration instead.

Local PGlite data is stored under `.data/pglite/` and must not be committed.

## Local development administrator

Stop the local backend, then run from the repository root:

```bash
pnpm run db:seed:local
```

This applies committed migrations to local PGlite and creates username `admin` with the public development-only password `admin`. It forces an empty `DATABASE_URL`, so it always targets `.data/pglite`, even when `.env` configures PostgreSQL. Tests never touch that directory: `vitest.setup.ts` forces `DATABASE_TYPE=pglite` with the in-memory `DATABASE_URL=memory://` for every suite. An existing local account is reset to the development password, enabled, and assigned the admin role while preserving its ID and related tickets. Restart the backend with `DATABASE_URL` empty to use this local account. Do not use this development password for deployed accounts.

## Commands

```bash
pnpm dev
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run test:watch
pnpm run build
pnpm start
pnpm --filter ticket-desk-webapp dev
pnpm --filter ticket-desk-webapp run build
```

The React frontend lives in `webapp/` and is part of the pnpm workspace. Run the backend and frontend in separate terminals for local development.

Unit tests use the `*.spec.ts` suffix and live beside the source they cover. The application E2E
suite follows the NestJS directory convention at `test/app.e2e.spec.ts`.

Formatting is provided by Oxfmt and linting by Oxlint. Their project configuration lives in `.oxfmtrc.json` and `.oxlintrc.json`.

`pnpm dev` checks types once, then tsdown watches source files and restarts the Node.js server after successful builds. Development writes only to the ignored `.tsdown-dev/` directory; it does not create or change `dist/`. Watch-mode rebuilds do not repeat type checking, so run `pnpm run typecheck` separately after edits.

`pnpm run build` checks types and creates a clean production build with tsdown. `pnpm start` runs the compiled `dist/server.js` entry point without a TypeScript runtime loader.

After `pnpm dev`, the service exposes:

- `GET /health` — health check
- `GET /openapi.json` — OpenAPI 3.1 document
- `GET /docs` — Swagger UI

If `PORT` is already occupied, startup automatically tries the next port and continues upward until it can listen. On success, the terminal prints a readable block with the selected port and these addresses:

```text
application: http://localhost:<port>
swagger:     http://localhost:<port>/docs
openApi:     http://localhost:<port>/openapi.json
```

## Logging

Development logs use `pino-pretty` with readable local timestamps and terminal colors when supported. Production and test logs remain structured JSON. `LOG_LEVEL` controls verbosity in every environment (default `info`). Set `NODE_ENV=production` when deploying; `pino-pretty` is a development dependency and is not required in production. See [the logging specification](./spec/common/logging.md).

## Graceful shutdown

The server handles `SIGINT` (Ctrl+C) and `SIGTERM` by stopping new HTTP
connections, waiting for active requests, closing the initialized PostgreSQL pool
or PGlite instance, and flushing logs. Repeated signals reuse the same shutdown.
`SHUTDOWN_TIMEOUT_MS` bounds the entire process; timeout or cleanup failure exits
with code 1. A successful shutdown exits naturally with code 0 unless a failure
exit code was already set. Force-killing a process cannot run cleanup; a process
manager must allow time for the signal handler to finish.

See [the shutdown specification](./spec/common/graceful-shutdown.md).

## Project conventions

Read [AGENTS.md](./AGENTS.md) and the relevant document in `spec/` before making changes. Routes own HTTP behavior; services own business logic; repositories own persistence access. New capabilities require a specification and corresponding tests.

Internal TypeScript source imports use the `.ts` extension. TypeScript checks these imports without emitting files; tsdown bundles the server into executable ESM.
