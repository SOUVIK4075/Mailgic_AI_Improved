# Mailgic-AI — client

React 19 + TypeScript + Vite 7 + Tailwind CSS 4 frontend for Mailgic-AI.
It talks to the Express API in `../server` using the contract in [`../docs/API.md`](../docs/API.md).

## Run it

```bash
cd client
npm install
npm run dev        # http://localhost:5173  (start the server on :4000 too)
```

In development Vite proxies every `/api/*` request to `http://localhost:4000`, so the browser
sees one origin and the httpOnly auth cookies work without any CORS setup.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) then build to `client/dist` |
| `npm run preview` | Serve the built `dist` locally |
| `npm run typecheck` | Type-check only |

In production Express serves `client/dist`, so it is still same-origin.

## Folder structure

```
src/
  main.tsx              entry point
  App.tsx               routes
  index.css             Tailwind import + small theme additions
  types.ts              types from docs/API.md
  lib/
    api.ts              fetch wrapper: cookies, JSON/FormData, ApiError, token refresh
    format.ts           date / mailto / copy-text helpers
    emailTypeIcons.ts   decorative emoji per email type
  context/
    AuthContext.tsx     the only auth state (user, login, signup, logout)
  hooks/
    useMeta.ts          GET /api/meta once (email types, tones, limits)
  components/           small reusable UI pieces (one per file)
  pages/                one file per route
```

## How auth works

1. On load `AuthContext` calls `GET /api/auth/me` to learn who is logged in.
2. Tokens live in httpOnly cookies, so JavaScript never sees them. `api.ts` just sends `credentials: 'include'`.
3. If a request fails with `401 TOKEN_EXPIRED`, `api.ts` calls `POST /api/auth/refresh` once and retries.
   Concurrent requests share one refresh call. If the refresh fails, the user is treated as logged out.
4. `ProtectedRoute` sends logged-out users to `/login` and back to the page they wanted after login.
