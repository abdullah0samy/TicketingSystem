# ABCH Hospital Ticketing CRM — Express → NestJS Migration Prompt

---

## CONTEXT

Read AGENTS.md for operating rules.
Read PRD.md for full system requirements.
Read AUDIT_REPORT.md for security fixes already applied — these MUST be preserved.

You are migrating the ABCH Hospital Ticketing CRM backend from Express to NestJS.

**Stack stays the same:**
- Node.js + TypeScript
- Prisma + PostgreSQL (schema unchanged)
- Socket.io
- BullMQ + Redis
- JWT auth (same logic, same token shape)
- Zod validation (kept as-is, wrapped in NestJS pipes)

**Migration strategy: INCREMENTAL — never break production.**
One module at a time. The Express app stays running until every module is migrated.
Each module is tested before moving to the next.

---

## RULES FOR THIS SESSION

RULE 1 — ONE MODULE AT A TIME
Migrate exactly one NestJS module per task. Wait for NEXT.

RULE 2 — PRESERVE ALL SECURITY FIXES
Every fix from AUDIT_REPORT.md must survive the migration.
If a security fix exists in Express, reimplement it in NestJS before marking the module done.
Never skip a security control because "NestJS handles it differently."

RULE 3 — NO LOGIC CHANGES
This is a structural migration, not a feature change.
Do not fix bugs, add features, or refactor business logic during migration.
If you find a bug, note it in a comment: `// TODO: [bug description]` and continue.

RULE 4 — SAME API CONTRACT
Every endpoint must:
- Have the same HTTP method and path
- Accept the same request body shape
- Return the same response shape
- Return the same HTTP status codes
The frontend must work with zero changes after migration.

RULE 5 — SHOW ONLY NEW FILES + CHANGED FILES
Never output files that don't change.
For new NestJS files, show the full file (they are new).
For modified files (app.module.ts, main.ts), show only the changed block.

RULE 6 — TEST BEFORE NEXT
After each module, run the existing Vitest tests for that module.
Report: PASS count, FAIL count, and exact error for each FAIL.
Fix all FAILs before proceeding.

---

## PHASE 0 — NESTJS SCAFFOLD (do this first)

Do NOT touch the existing Express code yet.

1. Read the current project structure completely
2. Install NestJS in the same repo as a parallel backend:
   ```
   npm install @nestjs/core @nestjs/common @nestjs/platform-express
   npm install @nestjs/jwt @nestjs/passport passport passport-jwt
   npm install @nestjs/swagger swagger-ui-express
   npm install @nestjs/bull bull
   npm install @nestjs/config
   npm install --save-dev @nestjs/cli @nestjs/testing
   ```
3. Create `src-nest/` directory — this is where NestJS lives during migration
   (Express stays in `src/` untouched)
4. Create `src-nest/main.ts` — NestJS app on port 4000 (Express stays on 3000)
5. Create `src-nest/app.module.ts` — root module, empty for now
6. Create `src-nest/prisma/prisma.service.ts` — wraps the existing Prisma client
   (same DATABASE_URL, same schema — do NOT create a new schema)
7. Create `src-nest/common/` with these shared utilities migrated from Express:
   - `guards/jwt-auth.guard.ts` — replaces authenticate middleware
   - `guards/roles.guard.ts` — replaces authorize middleware
   - `decorators/roles.decorator.ts` — @Roles() decorator
   - `decorators/current-user.decorator.ts` — @CurrentUser() decorator
   - `pipes/zod-validation.pipe.ts` — wraps existing Zod schemas as NestJS pipes
   - `filters/global-exception.filter.ts` — replaces Express global error handler
     IMPORTANT: must NOT expose stack traces in production (preserve security fix)
   - `interceptors/request-id.interceptor.ts` — preserves X-Request-ID header
8. Copy existing Zod schemas from `src/` into `src-nest/common/schemas/`
   — do not modify them, just copy
9. Configure Helmet, CORS, rate limiting in main.ts
   — match exact config from Express app.ts
10. Verify `src-nest/` compiles with zero TypeScript errors
11. Verify NestJS app starts on port 4000 and GET /health returns 200

Output: confirmation that scaffold compiles and starts. Then wait for NEXT.

---

## PHASE 1 — AUTH MODULE

File target: `src-nest/modules/auth/`

Migrate from: `src/modules/auth/routes.ts` + `src/core/middleware/auth.ts`

Create:
- `auth.module.ts`
- `auth.controller.ts` — same endpoints:
  - POST /api/auth/login
  - POST /api/auth/refresh
  - POST /api/auth/logout
- `auth.service.ts` — same business logic:
  - badgeNumber + password login
  - bcrypt password comparison
  - JWT access token (15min) + refresh token (7 days, HttpOnly cookie)
  - Token rotation on every refresh
  - SHA-256 hash of refresh token stored in DB
  - Single-session enforcement (new login revokes old refresh token)
  - Account lockout: 5 failed attempts → 15min lock (DB-persisted)
  - Last login IP + timestamp recorded
  - forcePasswordChange flag check
- `strategies/jwt.strategy.ts` — validates Bearer token, attaches user to request
- `strategies/refresh.strategy.ts` — validates refresh cookie

Security fixes to preserve (from AUDIT_REPORT.md):
- 401 response includes machine-readable `code` field ('MISSING_TOKEN', 'EXPIRED_TOKEN', 'INVALID_TOKEN')
- 403 response includes `code: 'FORBIDDEN'`
- loginLimiter: 10 attempts / 15min per IP — use @nestjs/throttler
- authLimiter (refresh/logout): 100 / 15min per IP
- logoutGuard singleton behavior — handled via stateless JWT invalidation
- BroadcastChannel logout: no change needed (frontend-only)

Rate limiting setup:
```typescript
// In auth.module.ts
ThrottlerModule.forRoot([
  { name: 'login', ttl: 900000, limit: 10 },
  { name: 'auth', ttl: 900000, limit: 100 },
])
```

Apply @Throttle({ login: {} }) on POST /login
Apply @Throttle({ auth: {} }) on POST /refresh and POST /logout

After migration:
- Run auth tests from tests/auth/auth.test.ts against port 4000
- All tests must pass before NEXT

---

## PHASE 2 — USERS MODULE

File target: `src-nest/modules/users/`

Migrate from: `src/modules/users/` or equivalent Express routes

Endpoints to migrate:
- GET /api/users/me
- PUT /api/users/profile
- PUT /api/users/avatar (multer file upload — keep same file handling)
- GET /api/users/me/permissions

Create:
- `users.module.ts`
- `users.controller.ts`
- `users.service.ts`

Security fixes to preserve:
- passwordHash field NEVER returned in any response
  (add explicit Prisma select that excludes passwordHash on every query)
- Avatar upload: file type validation (magic bytes check preserved)
- Avatar upload: size limit preserved

After migration:
- Run user tests against port 4000
- All tests must pass before NEXT

---

## PHASE 3 — ADMIN MODULE

File target: `src-nest/modules/admin/`

Migrate from: `src/modules/admin/` routes

Sub-resources to migrate (each as a separate NestJS controller):
- AdminUsersController — GET/POST/PUT/DELETE /api/admin/users
- AdminRolesController — GET/POST/PUT /api/admin/roles
- AdminBuildingsController — GET/POST/PUT/DELETE /api/admin/buildings
- AdminFloorsController — GET/POST/PUT/DELETE /api/admin/floors
- AdminDepartmentsController — GET/POST/PUT/DELETE /api/admin/departments
- AdminTicketTypesController — GET/POST/PUT/DELETE /api/admin/ticket-types

RBAC rules to preserve exactly:
- GET /api/admin/buildings — any authenticated user (needed for NewTicketPage dropdowns)
- POST/PUT/DELETE /api/admin/buildings — super_admin only
- GET /api/admin/floors — any authenticated user
- POST/PUT/DELETE /api/admin/floors — super_admin only
- ALL /api/admin/users — super_admin only
- ALL /api/admin/roles — super_admin only
- ALL /api/admin/departments — super_admin only (GET: authenticated)
- ALL /api/admin/ticket-types — super_admin only (GET: authenticated)

Pagination: all list endpoints return { data, pagination: { total, page, limit, pages } }
(preserve the pagination fix from audit)

After migration: run RBAC tests against port 4000. All must pass before NEXT.

---

## PHASE 4 — TICKETS MODULE

File target: `src-nest/modules/tickets/`

This is the largest module. Migrate ALL ticket endpoints:

Controllers:
- TicketsController (main CRUD)
- TicketStatusController (status transitions)
- TicketAssignmentController (assign/transfer)
- TicketCommentsController (messages)
- TicketAttachmentsController (file uploads)
- TicketArchiveController (archive operations)

Endpoints (preserve exact paths):
- POST /api/tickets
- GET /api/tickets/my
- GET /api/tickets/department
- GET /api/tickets/search
- GET /api/tickets/archived
- GET /api/tickets/transferred
- GET /api/tickets/:id
- PUT /api/tickets/:id/status
- PUT /api/tickets/:id/assign
- PUT /api/tickets/:id/transfer
- PUT /api/tickets/:id/confirm
- PUT /api/tickets/:id/archive
- PUT /api/tickets/:id/due-date
- PUT /api/tickets/:id/type
- PATCH /api/tickets/:id
- POST /api/tickets/:id/comments
- POST /api/tickets/:id/attachments
- GET /api/tickets/:id/history

Business logic to preserve exactly (all from audit fixes):
- Strict linear flow: open→in_progress→resolved→closed (no shortcuts)
- resolved/closed tickets locked (no edits except super_admin)
- inProgressAt set ONLY on first open→in_progress transition
- resolutionCategory + resolutionNotes required on →resolved
- TicketStatusHistory entry on EVERY status change
- AuditLog entry on: assignment, transfer, status change, archive
- Bulk archive: pre-check status is resolved/closed (400 otherwise)
- Auto-archive uses closedAt NOT updatedAt
- Transfer: clears assignee, creates TicketTransfer record
- SLA deadline calculated from departmentSlaHours or ticketType.slaHours
- SLA breach: calculate from slaDeadline vs resolvedAt (NOT slaBreachSent flag)
- Arabic search: normalize tashkeel + Alef variants before query
- Pagination: default 20, max 100

Priority enum values (Zod schema is source of truth):
Read the current Zod schema for priority and copy it exactly.
Do NOT change enum values.

Socket events to emit (preserve all):
- 'new-ticket' → dept room
- 'ticket-status-updated' → ticket room
- 'ticket-assigned' → user room (assignee)
- 'new-comment' → ticket room
- 'ticket-archived' → ticket room
- 'ticket-closed' → ticket room
- 'sla-warning' → dept room
- 'sla-breach' → dept room

Socket.io in NestJS: use @nestjs/websockets with the existing socket.ts logic
wrapped in a Gateway class. Keep same room names: dept-{id}, user-{id}, ticket-{id}.

After migration: run ticket lifecycle tests against port 4000. All must pass before NEXT.

---

## PHASE 5 — ANALYTICS MODULE

File target: `src-nest/modules/analytics/`

Endpoints:
- GET /api/analytics/dashboard-summary
- GET /api/analytics/stats
- GET /api/analytics/department-performance
- GET /api/analytics/recent-activity
- GET /api/analytics/agent-performance
- GET /api/analytics/aht
- GET /api/analytics/exports
- POST /api/analytics/export

AHT calculation (preserve fix):
- Use inProgressAt → completedAt
- Fallback to createdAt → completedAt for legacy tickets (inProgressAt is null)
- NEVER use createdAt → completedAt as primary calculation

SLA breach metric (preserve fix):
- Calculate: WHERE slaDeadline < resolvedAt (or completedAt)
- Do NOT use slaBreachSent flag for reporting

Agent performance scoping:
- supervisor: only agents in own department
- super_admin: all agents

Query optimization (preserve):
- Dashboard uses single groupBy for status counts (not 4 separate count queries)
- Agent performance has skip/take pagination

After migration: run analytics tests against port 4000. All must pass before NEXT.

---

## PHASE 6 — KNOWLEDGE BASE MODULE

File target: `src-nest/modules/knowledge/`

Endpoints:
- GET /api/knowledge/articles
- GET /api/knowledge/categories
- GET /api/knowledge/search
- GET /api/knowledge/suggest
- POST /api/knowledge/articles
- PUT /api/knowledge/articles/:id
- DELETE /api/knowledge/articles/:id
- POST /api/knowledge/categories
- DELETE /api/knowledge/categories/:id

Preserve:
- Soft delete on articles and categories (deletedAt)
- Non-empty category delete → 400
- KB suggest returns {id, titleAr, titleEn, snippetAr, snippetEn} (top 3)
- Arabic search normalization (same as tickets)
- Pagination on list endpoints
- canManageKnowledgeBase permission check on write operations

After migration: run KB tests against port 4000. All must pass before NEXT.

---

## PHASE 7 — ASSETS MODULE

File target: `src-nest/modules/assets/`

Endpoints:
- GET /api/assets
- POST /api/assets
- PUT /api/assets/:id
- DELETE /api/assets/:id

Preserve:
- Soft delete (deletedAt) — NOT hard delete
- AuditLog entry on every PUT (action: 'ASSET_UPDATED', diff of changed fields)
- FK guard on delete (cannot delete if asset linked to open tickets)
- Pagination on GET /api/assets
- super_admin only for DELETE
- super_admin + supervisor for POST/PUT

After migration: run asset tests against port 4000. All must pass before NEXT.

---

## PHASE 8 — TEAM NOTES MODULE

File target: `src-nest/modules/team-notes/`

Endpoints:
- GET /api/team-notes
- POST /api/team-notes
- PUT /api/team-notes/:id
- DELETE /api/team-notes/:id
- POST /api/team-notes/:id/comments
- POST /api/team-notes/:id/likes

Preserve:
- Department scoping (agent sees only own dept notes)
- end_user → 403 on all endpoints
- Like toggle (like → unlike → like)
- Socket event on new note and new comment

After migration: run team notes tests against port 4000. All must pass before NEXT.

---

## PHASE 9 — NOTIFICATIONS MODULE

File target: `src-nest/modules/notifications/`

Endpoints:
- GET /api/notifications
- PUT /api/notifications/:id/read
- PUT /api/notifications/read-all
- POST /api/notifications/subscribe (Web Push VAPID)
- DELETE /api/notifications/subscribe

Preserve:
- Web Push VAPID config (same keys from .env)
- Notification delivery on all ticket events
- Unread count in GET response

After migration: run notification tests against port 4000. All must pass before NEXT.

---

## PHASE 10 — AUDIT LOG MODULE

File target: `src-nest/modules/audit/`

Endpoints:
- GET /api/audit

Preserve:
- super_admin only access
- canViewAuditLogs permission check
- Pagination
- Filter by: action, userId, ticketId, dateRange

After migration: run audit tests against port 4000. All must pass before NEXT.

---

## PHASE 11 — BACKGROUND JOBS MIGRATION

File target: `src-nest/modules/jobs/`

Migrate BullMQ workers to NestJS @Processor:
- SLA warning job → SlaProcessor
- SLA breach job → SlaProcessor
- Auto-archive job → ArchiveProcessor
- Export job → ExportProcessor

Preserve:
- Auto-archive uses closedAt (NOT updatedAt)
- SLA breach detection uses slaDeadline vs resolvedAt (NOT slaBreachSent flag)
- Job retry logic unchanged
- Failed jobs logged to error log
- Jobs do NOT run twice if another instance is processing

Create `src-nest/modules/jobs/jobs.module.ts` with BullModule.registerQueue() for each queue.

After migration: run job tests against port 4000. All must pass before NEXT.

---

## PHASE 12 — SOCKET GATEWAY MIGRATION

File target: `src-nest/gateways/`

Migrate `src/core/socket.ts` to NestJS WebSocket Gateway:

```typescript
@WebSocketGateway({ cors: { origin: process.env.CLIENT_URL, credentials: true } })
export class TicketGateway implements OnGatewayConnection, OnGatewayDisconnect {}
```

Preserve ALL security from socket.ts:
- JWT validation on connection (reject if invalid/expired)
- Per-socket rate limiting: join-ticket 5/sec, reauthenticate 1/3sec
- isValidId() guard on all room joins
- Room structure: dept-{id}, user-{id}, ticket-{id}

After migration: run socket tests against port 4000. All must pass before NEXT.

---

## PHASE 13 — SWAGGER / API DOCS

File target: `src-nest/main.ts` (add Swagger setup)

Add @nestjs/swagger documentation to ALL controllers:
- @ApiTags() on each controller
- @ApiOperation() on each endpoint
- @ApiResponse() for all possible status codes
- @ApiBearerAuth() on protected endpoints
- DTOs with @ApiProperty() for all request/response shapes

Swagger UI available at: /api/docs (disabled in production via NODE_ENV check)

This is one of the benefits of NestJS over Express —
auto-generated docs from decorators.

After setup: verify Swagger UI loads at http://localhost:4000/api/docs

---

## PHASE 14 — CUTOVER PREPARATION

Before switching production from Express (port 3000) to NestJS (port 4000):

1. Run the FULL test suite against port 4000:
   - All 16 phases from ABCH_TEST_PROMPT.md
   - Every test that passed on Express must pass on NestJS
   - Zero regressions allowed

2. Run load test (same k6 script from AUDIT_PROGRESS.md):
   - Target: same or better than Express results
   - Express baseline: 156 req/s, P95 120ms, P99 347ms
   - NestJS must meet: ≥ 150 req/s, P95 ≤ 150ms

3. Generate coverage report:
   - statements ≥ 80%, branches ≥ 75%, functions ≥ 80%

4. Security checklist (verify all still pass):
   - [ ] No stack traces in production error responses
   - [ ] All security headers present (Helmet)
   - [ ] Rate limiting active on login + ticket creation
   - [ ] JWT algorithm consistent (sign and verify match)
   - [ ] No passwordHash in any API response
   - [ ] Soft deletes on all models
   - [ ] AuditLog on all sensitive operations

5. Output final readiness report:
```
MODULES MIGRATED: 12/12
TESTS PASSING: X/X
LOAD TEST: X req/s, P95 Xms
COVERAGE: X%
SECURITY CHECKS: X/7
STATUS: READY FOR CUTOVER / NOT READY (reason)
```

---

## PHASE 15 — CUTOVER

Only execute this phase after Phase 14 says READY FOR CUTOVER.

1. Update docker-compose.yml:
   - Change backend service to use `src-nest/` instead of `src/`
   - Change port from 3000 to 4000 (or keep 3000 and update main.ts)
   - Keep `src/` (Express) as a commented-out backup service

2. Update Coolify deployment config to point to NestJS build

3. Deploy to staging first — run smoke tests:
   - POST /api/auth/login ✓
   - GET /api/tickets/department ✓
   - GET /api/analytics/dashboard-summary ✓
   - Socket.io connection ✓

4. Deploy to production

5. Monitor for 30 minutes:
   - Watch Coolify logs for errors
   - Check P95 latency in production
   - Verify no 500 errors in the first 100 requests

6. If any issue → rollback: uncomment Express service in docker-compose.yml
   and redeploy (< 5 min rollback time)

7. After 48h stable → delete `src/` (Express code)
   Archive it first: `git tag express-final` before deletion

---

## START INSTRUCTION

Start with PHASE 0 now.
Read the existing project structure completely before writing any code.
Output the directory tree of src/ first so I can verify you read it correctly.
Then proceed with scaffold creation.
