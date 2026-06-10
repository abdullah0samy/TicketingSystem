# ABCH Hospital Ticketing CRM — Agent Guide

## Stack
- **Frontend**: React 19 + TypeScript, Vite 6, Tailwind CSS v4, Zustand, `@tailwindcss/vite` plugin
- **Backend**: Express + TypeScript, run with `tsx` (no compile step)
- **DB**: PostgreSQL + Prisma 6 (schema in `prisma/schema.prisma`)
- **Real-time**: Socket.io (client in `NotificationProvider.tsx`, server in `core/socket.ts`)
- **Queues**: BullMQ + Redis (dependency present; verify usage before assuming configured)

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (Vite middleware + Express on :3000) |
| `npm run build` | `vite build` — frontend only |
| `npm run lint` | `tsc --noEmit` (not ESLint; strict mode is OFF) |
| `npm test` | `vitest run` (globals:true, node env) |
| `npm run test:watch` | `vitest` (watch mode) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Seeds via `prisma/seed.ts` |
| `postinstall` | Auto-runs `prisma generate` |

## Architecture

### Entrypoints
- **Server**: `server.ts` (creates HTTP server, attaches Socket.io, mounts Vite middleware in dev)
- **Express app**: `src/app.ts` (middleware, routes, rate limiters, error handler)
- **Frontend**: `src/main.tsx` → `src/App.tsx` (SPA with custom routing via `navigate` CustomEvent)
- **Prisma singleton**: `src/core/db.ts` (global-cached for Vite HMR)

### Routing
- **Backend**: Express routers in `src/modules/*/` mounted under `/api/`
- **Frontend**: No React Router — path state in App component, switched via `currentPath` + renderContent()
- Navigation: `window.dispatchEvent(new CustomEvent('navigate', { detail: path }))`

### Directory layout
```
src/
  core/          — db, socket, cron, middleware, translations, swagger, paths
  modules/       — auth, tickets, users, admin, analytics, audit, knowledge, etc.
  store/         — Zustand stores (authStore, refreshStore, settingsStore)
  pages/         — Page components (SPA views)
  components/    — Shared UI (ErrorBoundary, GlobalSearch)
  lib/           — `cn()` utility (clsx + tailwind-merge)
```

### Testing
- `tests/unit/` — pure unit tests (no DB needed)
- `tests/integration/` — supertest-based, hits real PostgreSQL
- Test setup (`tests/setup.ts`) sets `NODE_ENV=test` and JWT secrets
- CI (`ci.yml`): spins up PostgreSQL + Redis services, runs `npx prisma db push`, then `npm test`

## Key Patterns

### Permissions
- Department-level + user-level overrides; cached in-memory with 30s TTL (`permissionCache.ts`)
- `checkTicketPermission()` in tickets routes handles the resolution chain

### Validation
- Zod schemas in each module; middleware `validate(body)` and `validateQuery` in `core/utils/api.utils.ts`

### API client
- `apiFetch` (`src/core/api.ts`) — auto-attaches Bearer token, auto-logouts on 401/403, prevents parallel logouts
- Always include `credentials: 'include'` for refresh cookie

### Real-time events
- Socket emits: `new-ticket`, `ticket-status-updated`, `ticket-assigned`, `new-comment`, `sla-warning`, `sla-breach`
- Rooms: `dept-{id}`, `user-{id}`, `ticket-{id}`
- Frontend listeners dispatch CustomEvents (`ws:*`) for data refresh

### Translations
- Bilingual (en/ar); keys defined in `core/translations.ts`, selected via `settingsStore.language`
- Components use `const t = translations[language]` pattern

## Database
- Tables use snake_case (`@@map`); all field names mapped with `@map`
- Soft deletes via `deletedAt` nullable DateTime
- Connection pool tuned via `DATABASE_URL` query params: `connection_limit=20&pool_timeout=30&connect_timeout=10`
- BigInt serialization fixed at app startup via `BigInt.prototype.toJSON` override

## CRON Jobs
| Schedule | Job | File |
|---|---|---|
| `0 3 * * *` | Delete expired export files & records | `core/cron.ts` |
| `*/5 * * * *` | SLA breach/warning checks + Socket.io alerts | `core/cron.ts` |
| `0 4 * * *` | Auto-archive resolved/closed tickets >30d old | `core/cron.ts` |

## Quirks & Gotchas
- `tsconfig.json` has `strict: false`, `noUnusedLocals: false`, `noUnusedParameters: false`
- All `.ts` imports include `.ts` extension (e.g., `from './foo.ts'`)
- Production `docker-compose.yml` uses port 3000, PostgreSQL on internal 5432, Redis on internal 6379 (ports are not exposed externally)
- Vite HMR disabled via `DISABLE_HMR` env var in AI Studio deployments
- `tsconfig.bak.json` exists with different settings — ignore it
- `npm run dev` runs ONE process (tsx server.ts) — no separate Vite dev server

## Existing instruction files
- `opencode.json` — not found; no custom OpenCode config detected
- No `CLAUDE.md`, `.cursorrules`, or `.cursor/rules/` found
