import { createAdaptorServer } from '@hono/node-server'
import { pathToFileURL } from 'node:url'

import { app } from './main.ts'
import { env } from './config/env.ts'
import { logger } from './lib/logger.ts'
import { registerGracefulShutdown } from './lib/shutdown.ts'
import { closeDatabase } from './db/client.ts'

type FetchHandler = Parameters<typeof createAdaptorServer>[0]['fetch']
type NodeServer = ReturnType<typeof createAdaptorServer>

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

const listenOnPort = (fetch: FetchHandler, port: number) =>
  new Promise<NodeServer>((resolve, reject) => {
    const server = createAdaptorServer({ fetch })

    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve(server)
    }

    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port)
  })

export const listenOnFirstAvailablePort = async (
  fetch: FetchHandler,
  startPort: number,
  endPort = 65_535,
) => {
  for (let port = startPort; port <= endPort; port += 1) {
    try {
      const server = await listenOnPort(fetch, port)

      logger.info({ port }, 'server listening')
      process.stdout.write(`${formatServerStartupMessage(port)}\n`)
      return server
    } catch (error) {
      if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        throw error
      }

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

export const startServer = () => listenOnFirstAvailablePort(app.fetch, env.PORT)

const isExecutedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isExecutedDirectly) {
  void startServer()
    .then((server) => {
      registerGracefulShutdown(server, {
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
