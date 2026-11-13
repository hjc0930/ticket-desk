import { describe, expect, it } from 'vitest'

import { formatServerStartupMessage, getServerAddresses } from './server.ts'

describe('server startup presentation', () => {
  it('reports the application, Swagger, and OpenAPI URLs for the listening port', () => {
    expect(getServerAddresses(4301)).toEqual({
      application: 'http://localhost:4301',
      openApi: 'http://localhost:4301/openapi.json',
      swagger: 'http://localhost:4301/docs',
    })
  })

  it('formats startup URLs for terminal readability', () => {
    expect(formatServerStartupMessage(4301)).toBe(`
╭─ Ticket Desk server is ready ──────────────────────────
│ Application  http://localhost:4301
│ Swagger UI   http://localhost:4301/docs
│ OpenAPI JSON http://localhost:4301/openapi.json
╰────────────────────────────────────────────────────────`)
  })
})
