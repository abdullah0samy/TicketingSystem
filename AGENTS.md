# Agent Rules — ABCH Hospital Ticketing CRM

Stack: React 19 + TypeScript (frontend), nest/Node.js + TypeScript (backend),
Prisma + PostgreSQL, Socket.io, BullMQ/Redis.

## Operating Rules — follow without exception

RULE 1 — ONE ISSUE AT A TIME  
Fix exactly one issue per response. Do not bundle fixes.

RULE 2 — NO ANALYSIS UNLESS ASKED  
Do not explain the problem. Go straight to the fix.

RULE 3 — SHOW ONLY CHANGED CODE  
Never output entire files. Show only the changed block with 3–5 lines of context.

RULE 4 — NO FILLER  
Do not write "Great question", "Sure!", "Hope that helps", or any variation.
Start your response with the file path.

RULE 5 — ONE SENTENCE SUMMARY  
After the code block, write exactly one sentence (≤20 words) starting with "WHY:".

RULE 6 — NEVER INVENT  
If unsure, say: "NEED MORE CONTEXT: [specific file]" and stop.

RULE 7 — TESTS  
If the fix touches business logic, append a minimal test under "// TEST:" (≤15 lines).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server (Express + Vite HMR via `tsx server.ts`) |
| `npm run build` | Vite production build (frontend only) |
| `npm run lint` | `tsc --noEmit` (no ESLint) |
| `npm test` | `vitest run` (all tests) |
| `npm run test:watch` | `vitest` (watch mode) |
| `npm run db:migrate` | `prisma migrate dev --name syntr_init` |
| `npm run db:seed` | `tsx prisma/seed.ts` |
| `npm run seed-full` | `tsx prisma/seed-full.ts && tsx prisma/seed-kb.ts` |
| `npm run seed-kb` | `tsx prisma/seed-kb.ts` |
| `npm run seed:test-users` | `tsx prisma/seed-test-users.ts` |
| `npm run load-test` | `tsx scripts/load-test.ts` |

## Architecture

- **Express backend** lives in `src/` (Express routes in `src/modules/*/`).
- **NestJS migration** lives in `src-nest/` — the NestJS app runs on port 4000
  (`NEST_PORT`). The two backends share `src/core/` (Prisma client, socket, paths).
  When editing, check if the module exists in both `src/` and `src-nest/`.
- **React frontend** shares `src/` with the Express backend. Entry: `src/main.tsx` →
  `src/App.tsx`. State via Zustand stores in `src/store/`.
- **Prisma schema**: `prisma/schema.prisma`. All tables use `@@map` for snake_case
  column names. Postinstall hook runs `prisma generate`.
- **Dev flow**: `tsx server.ts` boots Express + Vite middleware mode. No separate
  frontend dev server. Port defaults to 3000.
- **Prod flow**: Docker Compose (`docker-compose.yml`) — app on port 3007, Postgres
  on 5445, Redis on 9396. Dockerfile runs `prisma db push` on startup.
- **Tests**: Vitest, in `tests/`. Test setup (`tests/setup.ts`) mocks
  `socket.io-client` and sets test JWT secrets. Coverage thresholds in
  `vitest.config.ts`.
- **i18n**: Arabic-first (`ar` RTL). Language/theme stored in localStorage key
  `abc-settings-storage`. Translations in `src/core/translations.ts`.
- **BigInt serialization**: `(BigInt.prototype).toJSON` is patched in both
  `src/app.ts:6-8` and `src-nest/main.ts:20-22`.

## Key files at a glance

| File | Purpose |
|---|---|
| `server.ts` | Entry: creates HTTP server, attaches Socket.io, Vite/static middleware |
| `src/app.ts` | Express app wiring: middleware, rate limiters, route mounting |
| `src/core/db.ts` | Prisma singleton (HMR-safe) with error middleware |
| `src/core/socket.ts` | Socket.io setup with Redis adapter |
| `src/core/cron.ts` | Cron jobs (SLA checks, etc.) |
| `src/core/paths.ts` | `UPLOADS_DIR`, `AVATARS_DIR`, `EXPORTS_DIR`, `DIST_DIR` |
| `src/core/api.ts` | Frontend API fetch wrapper |

## Testing quirks

- Single test file: `npx vitest run tests/path/to/file.test.ts`
- Frontend tests use `jsdom` environment; backend tests use `node` environment.
  The vitest config sets global `environment: 'node'` — frontend tests may need
  `// @vitest-environment jsdom` at the top of the file.
- `NODE_ENV=test` is set in `tests/setup.ts` along with dummy JWT secrets.
- msw (Mock Service Worker) is available in devDependencies for API mocking.
