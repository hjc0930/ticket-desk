# Application Logging

## Contract

Use Pino for application logs. `LOG_LEVEL` controls the severity threshold in every environment and defaults to `info`.

- Development (`NODE_ENV=development`, the default) uses the `pino-pretty` transport with readable local timestamps. Enable colors only when standard output is a TTY.
- Production and test environments emit structured JSON to standard output without loading `pino-pretty`.
- Install `pino-pretty` as a development dependency only. Production deployments must set `NODE_ENV=production`.
- Preserve authorization and cookie header redaction. Never log credentials or request bodies.
- Keep request IDs and structured request fields available in both output formats.
- The Fastify instance receives the existing Pino logger via `loggerInstance`; Fastify's built-in request logging stays disabled and request lifecycle logs keep coming from the application's response hook.

## Verification

Colocated logger tests verify environment selection, log level, redaction, and terminal color behavior using mocked Pino construction. Verify a real development transport emits readable output and a production logger emits JSON.
