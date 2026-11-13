import { pathToFileURL } from 'node:url'

import { env } from './config/env.ts'
import { closeDatabase } from './db/client.ts'
import { logger } from './lib/logger.ts'
import { registerGracefulShutdown } from './lib/shutdown.ts'
import { createApp } from './main.ts'
import type { AppInstance } from './types.ts'

export const getServerAddresses = (port: number) => {
  const baseUrl = `http://localhost:${port}`

  return {
    application: baseUrl,
    openApi: `${baseUrl}/openapi.json`,
    swagger: `${baseUrl}/docs`,
  }
}

export const formatServerStartupMessage = (port: number) => {
  const { application, openApi, swagger } = getServerAddresses(port)

  return [
    '',
    '╭─ Ticket Desk server is ready ──────────────────────────',
    `│ Application  ${application}`,
    `│ Swagger UI   ${swagger}`,
    `│ OpenAPI JSON ${openApi}`,
    '╰────────────────────────────────────────────────────────',
  ].join('\n')
}

// A Fastify instance cannot restart after close(), so each port attempt builds
// a fresh instance through the factory and discards the failed one.
export const listenOnFirstAvailablePort = async (
  createInstance: () => Promise<AppInstance>,
  startPort: number,
  endPort = 65_535,
) => {
  for (let port = startPort; port <= endPort; port += 1) {
    const instance = await createInstance()
    try {
      // Dual-stack bind keeps parity with the previous Node adapter: listen(port)
      // on all interfaces, so occupied ports surface as EADDRINUSE.
      await instance.listen({ port, host: '::' })

      logger.info({ port }, 'server listening')
      process.stdout.write(`${formatServerStartupMessage(port)}\n`)
      return instance
    } catch (error) {
      if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        throw error
      }

      await instance.close()

      logger.warn(
        {
          attemptedPort: port,
          nextPort: port === endPort ? undefined : port + 1,
        },
        'port is in use; trying the next port',
      )
    }
  }

  throw new Error(`No available port found between ${startPort} and ${endPort}`)
}

export const startServer = () => listenOnFirstAvailablePort(createApp, env.PORT)

const isExecutedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isExecutedDirectly) {
  void startServer()
    .then((instance) => {
      registerGracefulShutdown(instance.server, {
        closeDatabase,
        logger,
        timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
      })
    })
    .catch((error: unknown) => {
      logger.fatal({ error }, 'server failed to start')
      process.exitCode = 1
    })
}
