# Web Application Baseline

## Status

In progress.

## Goal

Create a separately scoped React web application in `webapp/` as a pnpm workspace package for the ticket system. The application is a client-rendered single-page app and consumes the existing Hono API.

## Technology decisions

- React 19 with TypeScript.
- Vite for development and production builds.
- React Router for client-side routing.
- TanStack Query for server-state fetching and caching.
- Tailwind CSS v4 through its Vite plugin.
- pnpm for dependency management, consistent with the backend repository.
- Pin core dependencies to exact versions in `package.json`.

## Boundaries

- Do not add server-side rendering or a second backend.
- Keep the frontend in its own `webapp/` directory and package manifest; use the repository root lockfile for the pnpm workspace.
- During local development, proxy `/api/*` and `/health` to the Hono backend. The target defaults to `http://localhost:3000` and can be overridden with `VITE_API_PROXY_TARGET`.
- Preserve the backend API response and authentication contracts; frontend feature work must follow the relevant module specification.

## Source organization

- `src/main.tsx` owns application startup and global providers; `src/App.tsx` defines client-side routes.
- `src/services/` contains the API client, request types, and session request handling.
- `src/views/`, `src/components/`, and `src/hooks/` contain route pages, reusable components, and React hooks respectively.
- `index.html` loads `/src/main.tsx` as the application entry point.
- Workspace navigation includes tickets, categories, and administrator-only user management. Ticket creation is accessed from the ticket list instead of a separate workspace navigation item.

## Baseline acceptance

- `webapp/` contains a minimal React application with client-side routing and query-provider setup.
- The app can request the backend health endpoint through the development proxy.
- `pnpm --filter ticket-desk-webapp run build` produces static frontend output.
- Setup and run instructions are documented in `webapp/README.md`.
