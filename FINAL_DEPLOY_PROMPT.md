# ABCH Hospital Ticketing CRM — Final Integration Audit + Clean Deploy

---

## CONTEXT

Read AGENTS.md for operating rules.

This is the FINAL phase before production deploy. Two parts:
PART 1 — full UI/page wiring audit (every page, every component, every API call)
PART 2 — clean repo + Docker setup + Coolify-ready deployment with auto-generated secrets

Wait for NEXT between parts and major sections.

---

## PART 1 — FULL FRONTEND WIRING AUDIT

For EVERY page/route in the React app, verify:
1. The page renders without console errors when loaded fresh
2. Every API call it makes points to an existing, correctly-pathed NestJS endpoint
3. Every button/action on the page is wired to a real handler (no dead `onClick={}`)
4. Every conditional render based on `user.role` matches the actual backend
   permission for that action (re-confirm — this was the focus of the last audit)
5. Loading states show while data fetches
6. Empty states show when data arrays are empty (not blank screen)
7. Error states show when API returns 4xx/5xx (not blank screen)

Go through ALL pages systematically:

**Core:**
- LoginPage
- DashboardPage

**Tickets:**
- InboxPage
- MyTicketsPage
- NewTicketPage
- TicketDetailsPage
- ArchivedTicketsPage / ArchivePage
- TransferredTicketsPage (if exists)

**Knowledge:**
- KnowledgeBasePage

**Team:**
- TeamFeedPage / TeamNotesPage

**Analytics:**
- AnalyticsPage

**Admin (super_admin / supervisor where applicable):**
- UserManagementPage
- RoleManagementPage
- BuildingsPage
- FloorsPage
- DepartmentsPage
- TicketTypesPage
- AssetManagementPage
- AuditLogPage

**Profile:**
- ProfilePage
- NotificationSettingsPage (if exists)

For each page output one row in this table:

| Page | API Calls Verified | Buttons Wired | Role Gates Correct | Loading/Empty/Error States | Issues Found |
|------|---------------------|----------------|----------------------|------------------------------|---------------|

For any "Issues Found", fix immediately following AGENTS.md rules,
then re-verify and update the row to ✅.

After the table, also verify GLOBAL components:
- Sidebar/Nav — every link points to a route that exists and matches role visibility
- NotificationProvider — socket events all have listeners, no orphaned emits
- ErrorBoundary — wraps the app, catches render errors gracefully
- Toast/notification system — works for success and error cases

Run `npx tsc --noEmit` and `npm run build` (frontend) — both must be clean.
Run `npm test` (backend) — must still be 220/220 (or current passing count).

Output final summary:
```
PAGES AUDITED: X/X
ISSUES FOUND: X
ISSUES FIXED: X
TSC: clean/errors
BUILD: success/fail
TESTS: X/X passing
```

Wait for NEXT before Part 2.

---

## PART 2 — CLEAN DEPLOYMENT PACKAGE

### STEP 1 — REPO CLEANUP

Run `git status --porcelain` and remove anything that shouldn't ship:
- node_modules/, dist/, build/, coverage/, .next/
- Any *.log, *.tmp, *.dump, *.sql files
- Old Express remnants if any (src-nest leftovers, old configs)
- Duplicate/unused config files (old jest.config if Vitest is used, etc.)
- Any local seed data dumps not meant for git

Verify `.gitignore` includes: node_modules, dist, .env, .env.production,
*.log, coverage, .DS_Store, *.tsbuildinfo, uploads/* (except .gitkeep)

List the final file tree (max depth 3, excluding node_modules) for review.

### STEP 2 — AUTO-GENERATE ALL SECRETS

Create a script `scripts/generate-secrets.sh` that:
1. Generates a random 64-char hex string for JWT_ACCESS_SECRET
2. Generates a different random 64-char hex string for JWT_REFRESH_SECRET
3. Generates a random 32-char hex string for POSTGRES_PASSWORD
4. Generates VAPID keys for Web Push (use `npx web-push generate-vapid-keys`
   if web-push is a dependency, otherwise generate via crypto)
5. Outputs everything into a new file `.env.production` (gitignored)
6. Also prints all values to stdout in a clean `KEY=value` format ready
   for copy-paste into Coolify's environment variables UI

Run this script now and show me the generated `.env.production` content
(values included — this is local generation, not committed to git).

### STEP 3 — DOCKERFILE (BACKEND - NestJS)

Create `Dockerfile` at root (or `Dockerfile.backend` if frontend needs separate):
- Multi-stage build:
  - Stage 1 (builder): node:20-alpine, npm ci, npx prisma generate, npm run build
  - Stage 2 (runner): node:20-alpine, copy only dist/ + node_modules (production)
    + prisma/ + package.json
  - Run as non-root user
  - Expose port 3000 (internal — matches what NestJS main.ts listens on)
  - CMD runs: `npx prisma migrate deploy && node dist/main.js`
    (migrations run automatically on container start)
- Healthcheck: `CMD curl -f http://localhost:3000/api/health || exit 1`

### STEP 4 — DOCKERFILE (FRONTEND - React + Nginx)

Create `Dockerfile.frontend`:
- Multi-stage:
  - Stage 1: node:20-alpine, npm ci, npm run build (Vite)
  - Stage 2: nginx:alpine, copy dist/ to /usr/share/nginx/html
- Create `nginx.conf`:
  - Serve static files
  - SPA fallback: try_files $uri /index.html
  - Proxy /api and /socket.io to backend service (use Docker service name,
    e.g. `proxy_pass http://backend:3000`)
  - Gzip enabled
- Expose port 80

### STEP 5 — DOCKER-COMPOSE.YML (FULL STACK)

Create `docker-compose.yml`. Reminder of HOST ports already in use on the
target server (from earlier audit) — DO NOT use these as host mappings:
3000, 3005, 5173, 5432, 5678, 5680, 6379, 8000, 8080, 8443, 9000, 9001, 80, 443

Services:

**postgres:**
- image: postgres:15-alpine
- environment: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD (from .env.production)
- volume: named volume `pgdata` for persistence
- healthcheck: pg_isready
- host port: choose unused port (e.g. 5434 — verify against blocked list)
- internal port: 5432 (container-internal, no conflict)

**redis:**
- image: redis:7-alpine
- volume: named volume `redisdata`
- healthcheck: redis-cli ping
- host port: choose unused (e.g. 6381 — verify)
- internal port: 6379

**backend:**
- build: from Dockerfile (Stage 2)
- depends_on: postgres (healthy), redis (healthy)
- env_file: .env.production
- DATABASE_URL constructed to point to `postgres` service name (not localhost)
- REDIS_URL constructed to point to `redis` service name
- host port: choose unused (e.g. 3011 — verify)
- internal port: 3000
- healthcheck: curl /api/health
- restart: unless-stopped

**frontend:**
- build: from Dockerfile.frontend
- depends_on: backend (healthy)
- host port: choose unused (e.g. 5175 — verify)
- internal port: 80
- restart: unless-stopped

All services on network: `ticketing-network`

Add inline comments explaining EVERY port choice
(e.g. "# 3011: host 3000/3005 taken by other apps, 3010 reserved, using 3011").

### STEP 6 — AUTOMATED SEED ON FIRST START

Verify/create a Prisma seed script (`prisma/seed.ts`) that:
- Is idempotent (checks if data exists before inserting — per earlier audit fix)
- Creates: at least 1 super_admin user, departments, buildings, floors,
  ticket types, and DeptPermissions defaults
- Runs automatically via `npx prisma db seed` — add this to the backend
  Dockerfile CMD AFTER migrate deploy, but make it safe to run on every restart
  (idempotent check prevents duplicate seeding)

Output the seed credentials (e.g. super_admin badge number + password) that
will be created — these need to be known for first login after deploy.

### STEP 7 — VALIDATE EVERYTHING LOCALLY

1. `docker compose config` — must produce valid merged config, no errors
2. `docker compose build` — both images build successfully
3. `docker compose up -d` — all 4 containers start and reach healthy status
4. `docker compose ps` — show status of all services
5. Test from host machine:
   - `curl http://localhost:<backend-port>/api/health` → 200
   - `curl http://localhost:<frontend-port>/` → 200, HTML returned
   - POST login with seeded super_admin credentials → 200 with token
6. `docker compose logs backend --tail=50` — confirm migrations ran,
   seed ran, no errors
7. `docker compose down -v` — clean teardown (only for THIS local test —
   do not run this on the actual deploy target)

Output PASS/FAIL for each of the 7 checks.

### STEP 8 — COMMIT & PUSH

If Step 7 is 100% PASS:

```
git add .
git commit -m "feat: production deployment package

- Multi-stage Dockerfiles for backend (NestJS) and frontend (React+Nginx)
- docker-compose.yml with isolated network, persistent volumes, healthchecks
- Auto-generated secrets script (scripts/generate-secrets.sh)
- Idempotent Prisma seed for first-run setup
- All host ports verified non-conflicting with existing server services
- Full frontend wiring audit: all pages, role gates, and API contracts verified"

git push origin NESTJS
```

### STEP 9 — FINAL DEPLOY INSTRUCTIONS

Output a short numbered list for ME to follow in Coolify UI:
1. Which docker-compose.yml to point Coolify at
2. Which env vars to paste (reference .env.production — do NOT print secrets
   again here, just say "paste contents of .env.production generated in Step 2")
3. Which port Coolify should expose/proxy for the frontend
4. Confirm: does Coolify need FRONTEND_URL / CORS origin env var set to the
   final public domain? If yes, list it as a placeholder I need to fill in
   (this is the ONE value that genuinely cannot be auto-generated — it depends
   on the domain Coolify assigns or the custom domain I choose)

---

## START

Begin with PART 1. Audit pages in the order listed. Fix issues as you find them.
