# AGENTS.md

This file defines how agents should work in the Ticket Desk Backend repository.

## Project Context

- This is a ticket-system backend built with Node.js, Hono, and TypeScript.
- Persistence uses Drizzle ORM. `DATABASE_TYPE` (`postgres` or `pglite`) selects the engine; when unset, a URL-shaped `DATABASE_URL` selects the `node-postgres` adapter and anything else falls back to embedded PGlite. With `pglite`, `DATABASE_URL` is the data directory (default `.data/pglite`, or `memory://`). Tests force an isolated in-memory PGlite via `vitest.setup.ts`.
- `src/db/client.ts` owns lazy database initialization and cleanup; `src/db/schema.ts` defines the database schema.
- `src/main.ts` composes the application, `src/server.ts` handles startup, and `src/lib/shutdown.ts` coordinates graceful shutdown.
- `src/openapi.ts` configures OpenAPI and Swagger documentation; public contracts are defined in routes and Zod schemas.
- Project documentation, code comments, and API descriptions use English.

## Context Maintenance

- Update this overview when the architecture, runtime stack, or key entry points change.
- Use the relevant document in `spec/` and its source files for implementation details; keep this overview concise instead of duplicating specifications.
- For conceptual questions, use available context and inspect only the files needed to verify project-specific claims. Expand the search when the relevant implementation is unclear.
- Verify current code before relying on remembered implementation details; update stale documentation when changing the affected behavior.

## Development Commands

The project requires Node.js 22.18+, 24.11+, or 26+, and pnpm. Run commands from the repository root.

### Setup and local server

- `pnpm install` — install dependencies from the lockfile.
- `cp .env.example .env` — create local configuration; never commit `.env`.
- `pnpm dev` — type-check once, then use tsdown to watch, compile into `.tsdown-dev/`, and restart the Node.js server.
- `PORT=<port> pnpm dev` — prefer a specific local port. If occupied, the server searches higher ports and prints the selected application, Swagger UI, and OpenAPI URLs.
- `pnpm start` — run the compiled production server from `dist/`.

### Quality checks

- `pnpm run format` — format supported files with Oxfmt.
- `pnpm run format:check` — verify formatting without changing files.
- `pnpm run lint` — run Oxlint.
- `pnpm run typecheck` — run TypeScript checking without emitting files.
- `pnpm test` — run colocated unit tests once.
- `pnpm run test:e2e` — run the application E2E suite.
- `pnpm run test:watch` — watch colocated unit tests while developing.
- `pnpm test -- src/<path>/<file>.spec.ts` — run one unit test file while iterating.
- `pnpm run build` — type-check and build the production server into `dist/` with tsdown.

### Database commands

- `pnpm run db:generate` — generate Drizzle artifacts after a schema change.
- `pnpm run db:migrate` — apply a migration after it has been reviewed and created.
- Run `pnpm run db:generate` only when intentionally changing `src/db/schema.ts`.
- Review generated migration SQL before applying or committing it, and commit the schema change, migration SQL, and migration metadata together.
- Do not generate migrations during setup, startup, CI, or deployment; those environments only run `pnpm run db:migrate` against committed migrations.
- Do not edit a migration that has already been shared or applied; create a new migration for subsequent changes.

## Working Rules

- Read the relevant document in `spec/` before changing code or configuration.
- Treat every new feature or material behavior change as incomplete until its specification and tests are updated.
- Make small, reviewable changes. Do not perform unrelated refactors.
- Preserve public API behavior unless the relevant specification explicitly changes it.
- Run the smallest relevant check while iterating; before handoff, run formatting, linting, type checking, tests, and build.
- Do not edit generated `dist/` output by hand; regenerate it with `pnpm run build`.

## Specification Organization

- Top-level specs use numeric prefixes (`0001-`, `0002-`, ...) and record project-level decisions, baselines, and roadmaps. The active roadmap is `spec/0002-ticket-system-roadmap.md`; future module development plans are added to this roadmap instead of creating new top-level specs.
- Related modules are grouped into one batch folder named `spec/module-<batch>/` (for example `spec/module-auth-users/`, `spec/module-tickets/`). Prefer adding a module to an existing related folder before creating a new one; create a new folder only when a planned batch is initiated.
- Spec files inside module folders are named after the function with no numeric prefix (for example `login.md`, `tickets-crud.md`); add each file when its specification is drafted.
- Project-wide common rules live in `spec/common/`; put cross-module conventions there instead of duplicating them in module specs.
- Module-level specs describe colocated unit tests only and contain no E2E-related content. E2E test coverage is specified in its own dedicated spec file, separate from module specs.

## Architecture

- `src/main.ts` composes the Hono application; `src/server.ts` owns Node.js startup and port fallback.
- Keep HTTP routing and response concerns in `routes/` and `middleware/`.
- Put request and response validation schemas in `schemas/`, business logic in `services/`, and persistence access in `repositories/`.
- Routes must not access the database directly.
- Validate all external input with Zod and update OpenAPI definitions whenever public API contracts change.
- Type aliases inferred from Zod schemas must use the `Type` suffix (for example, `type EnvType = z.infer<typeof envSchema>`).
- Internal TypeScript imports use the `.ts` extension. TypeScript checks with `noEmit`; tsdown bundles the executable `.js` build.

## Testing

- Keep unit tests beside their source as `*.spec.ts` files.
- Keep application E2E tests in `test/` as `*.e2e.spec.ts` files.
- Do not write E2E tests while implementing modules; module work ships with colocated unit tests only.
- Every new behavior or bug fix requires focused test coverage.
- Test both success and failure paths, including relevant boundary cases.
- Keep tests hermetic: do not require a live database, network access, real credentials, or a manually started server.
- Prefer focused assertions and fixtures over broad test setup.

## Code Style and Logging

- Use Oxfmt and Oxlint; do not add ESLint or Prettier without an approved specification change.
- Keep comments concise and explain only information not obvious from the code.
- Use Pino for application logs. Do not add ad-hoc `console.log` or `debugger` calls; the readable startup address block in `src/server.ts` is the intentional exception.
- Never log request bodies or sensitive headers unless a specification explicitly permits a safely redacted form.

## Dependencies

- Pin core runtime dependencies to exact, verified versions.
- Non-core and development dependencies may use `^` or `~` ranges.
- Never use `latest` or another floating distribution tag in dependency declarations.
- Do not add dependencies unless they are necessary for the active specification.

## Security and Secrets

- Never read, print, commit, or create real API keys, tokens, passwords, cookies, authorization headers, or production connection strings.
- Use `.env.example` only for variable names and safe placeholder values.
- Do not connect to a production database or apply migrations unless the user explicitly requests it.
