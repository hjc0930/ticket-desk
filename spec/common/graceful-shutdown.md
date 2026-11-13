# Graceful Shutdown

## Contract

The executable server registers SIGINT and SIGTERM handlers after it starts
listening. Importing the application or calling the low-level server helpers does
not register process listeners. All messages and configuration documentation are
in English.

On the first signal:

1. Stop accepting new connections with the Fastify instance's `close()` (which
   closes the underlying HTTP server) and allow active HTTP requests to finish.
   The supported Node.js versions also close idle HTTP connections through this
   API.
2. Close the initialized database client: `pg.Pool.end()` for PostgreSQL or
   `PGlite.close()` for the embedded database. Do not initialize a database during
   shutdown. Once database closure begins, reject attempts to acquire it again.
3. Log completion, flush Pino, and set exit code 0 (preserving a previously set
   nonzero exit code). Allow the event loop to finish naturally.

Repeated signals share the same shutdown promise and do not restart the deadline
or repeat cleanup. Remove the registered listeners when shutdown finishes.

`SHUTDOWN_TIMEOUT_MS` defaults to 10000 and accepts integers from 1 to 2147483647.
A single referenced timer covers HTTP draining, database closure, and log flushing.
At the deadline, force-close remaining HTTP connections where supported, log the
timeout, attempt a best-effort log flush, and terminate with exit code 1. Never
wait indefinitely for cleanup or logging.

An HTTP close failure is logged and triggers force-closing HTTP connections before
database cleanup is attempted. An already closed server is treated as drained.
Database and log-flush failures are logged and result in exit code 1, with forced
termination after the remaining cleanup attempts. Successful HTTP draining must
precede database closure so in-flight requests can still use the database.

## Scope and limitations

No public API or OpenAPI changes. No asynchronous cleanup in `exit` or
`beforeExit` handlers, and no change to uncaught-exception handling. SIGKILL and
forcible OS/process-manager termination cannot run JavaScript cleanup. Development
watcher shutdown is graceful only when the watcher delivers a supported signal
and allows enough time before forcibly terminating its child.

## Verification

Colocated tests use injected process/server/logger doubles and fake timers.
Cover both signals, cleanup ordering, repeated signals, a previously closed
server, HTTP/database/logging failures, deadlines in every phase, listener/timer
cleanup, and preservation of a pre-existing failure exit code. Database lifecycle
tests mock both drivers and filesystem access, checking lazy initialization,
single closure, failure propagation, and prevention of reopening. Configuration
tests check defaults, overrides, and invalid timeout boundaries.

Run formatting, linting, type checking, unit tests, existing application E2E tests,
and the production build before handoff. Do not use a real database or secrets.
