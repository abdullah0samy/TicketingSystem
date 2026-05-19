# ABCH Ticketing System — 360° Audit Tracker

**Commit Base:** `e7a49c6` → **Current Head:** `a4dec00`
**Date Started:** 2026-05-19
**Auditor:** Lead QA / System Architect

---

## Phase 1: Core Architecture, Auth & Real-Time Stability

### 1.1 Sessions & Browser Handling
**Status:** ✅ COMPLETE
**Files:** `auth.routes.ts`, `auth.utils.ts`, `auth.middleware.ts`, `api.ts`, `authStore.ts`, `app.ts`, `Login.tsx`
**Findings:**
- [x] Cookie flags (HttpOnly/Secure/SameSite) verified — all correct
- [x] Silent token refresh verified — singleton pattern, no loops
- [x] Logout flow verified (server + client state) — clears cookie + sessionStorage + BroadcastChannel
- [x] BroadcastChannel multi-tab sync — logout propagates to all tabs
- [x] sessionStorage vs localStorage audit — sessionStorage (cleared on tab close); user removed from storage in Task 3
- [x] CSRF protection audit — sameSite: 'strict', httpOnly cookie; no CSRF token needed
- [x] Access token JWT payload audit — { id, role, departmentId }, 8h expiry, signed with ACCESS_SECRET
- [x] Token rotation / revocation audit — rotated on every /refresh, SHA-256 hashed in DB, single-session
**Remediation:**
- Task 1 (`718c58d`): auth.middleware.ts — 401 for expired/invalid tokens, machine-readable `code` field
- Task 2 (`265ea4e`): api.ts — `code === 'FORBIDDEN'` matching, singleton `logoutGuard`
- Task 3 (`0f0e25a`): authStore.ts — stop persisting user in sessionStorage
- Task 4 (`e21733b`): analytics/audit/knowledge routes — add `code: 'FORBIDDEN'` to all 403s

### 1.2 WebSockets & Real-Time
**Status:** ✅ COMPLETE
**Files:** `socket.ts`, `NotificationProvider.tsx`
**Remediation:**
- Task 6 (`b925f6d`): NotificationProvider — connect_error triggers /api/auth/refresh once per lifecycle
- Task 7 (`b925f6d`): socket.ts — per-socket rate limiting (join-ticket 5/sec, reauthenticate 1/3s)
- Task 8 (`18a8bde`): socket.ts — isValidId() guard, unused SOCKET_TOKEN_TIMEOUT removed

### 1.3 Scale & Performance (20-Year Horizon)
**Status:** ✅ COMPLETE
**Files:** `prisma/schema.prisma`, `tickets.routes.ts`, `analytics.routes.ts`
**Findings:**
- [x] 17 Ticket indexes existed — 4 gaps identified and added
- [x] GET /search had no limit cap — added Math.min(limit, 100)
- [x] GET /archived had no time-bound default — added 90-day archivedAt filter
- [x] GET /agent-performance had no pagination — added skip/take + total count
- [x] Dashboard-summary ran 16+ parallel queries — consolidated 4 individual counts → single groupBy; consolidated 2 resolution-type queries → single groupBy
- [x] /stats endpoint same anti-pattern — consolidated 4 counts → single groupBy
**Remediation:**
- Task 9 (`90ac4fa`): Add 4 missing DB indexes (TicketTransfer.ticketId, TicketAttachment.ticketId, Ticket.priority, Ticket.isArchived+archivedAt)
- Task 10 (`0594eb2`): Limit caps (search 100 max), agent-performance pagination, 90-day archive filter
- Task 11 (`a4dec00`): Consolidate dashboard-summary and stats count queries (16→14 parallel queries, 6→3)

### 1.4 Load Testing
**Status:** ✅ COMPLETE (Scripts + Execution)
**Files:** `loadtest/k6-ticketing.js`, `loadtest/simple-loadtest.js`
**Results (Production — ticket-dev.abchospitaleg.com):**
| Metric | Value |
|---|---|
| Concurrency | 50 VUs |
| Duration | 60s |
| Throughput | 156 req/s |
| Avg Latency | 64ms |
| P50 Latency | 32ms |
| P95 Latency | 120ms |
| P99 Latency | 347ms |

**Notes:**
- Coolify reverse-proxy rate limit: 2000 req/15min per IP (not app-level)
- App endpoints respond at 27-32ms median even under load
- P95 well under 500ms threshold — performance targets met
- Rate limit does not affect normal user traffic; only high-volume automated testing
- Per-worker login + Retry-After awareness added to simple-loadtest.js
- k6 script rewritten: single `setup()` login, token shared across VUs
- All authenticated HTTP checks passed (100%) when login succeeded
- Full multi-IP load test deferred to deployment environment

**Known Infrastructure Limit:** Production server (`i6591b2qbpilq7y5186xa4ki` container on Coolify) supports ~156 req/s before Coolify reverse-proxy rate-limits the origin IP. No app-level performance bottleneck identified.

---

## Phase 2: UI/UX, Typography & Dashboard Revamp
**Status:** ✅ COMPLETE

### 2.1 Typography & RTL Defaults
**Status:** ✅ COMPLETE
- Font stack: Inter (primary), Cairo (Arabic), JetBrains Mono (code)
- HTML: `lang="ar" dir="rtl"` globally

### 2.2 Dashboard Revamp
**Status:** ✅ COMPLETE (`2d492ab`)
- Removed fake "+12%" badges from KPI cards
- SPA routing for navigation
- Health monitor widget

### 2.3 RTL/LTR Layout Fixes
**Status:** ✅ COMPLETE (`9e8ce30`)
- Colon placement fixes in RTL
- JSON viewer forced LTR inside RTL pages
- Voice note spacing consistent
- CSS variables for bidirectional theming

### 2.4 Dashboard Layout & Profile
**Status:** ✅ COMPLETE (`763041c`, `e2fc691`)
- KB search banner hidden for admin/agent (visible only to `end_user`)
- `font-mono` on all ticket numbers (Inbox, MyTickets, Transferred, Archive, Audit, TicketDetails)
- Profile card: shows department + role badge
- Sidebar: `px-4 py-5` for RTL/LTR stability
- Avatar: `w-10 h-10` with `onError` fallback

---

## Phase 3: Business Flow & Core Functionality
**Status:** ✅ COMPLETE

### 3.1 All 15 Business Flows Mapped & Audited
**Status:** ✅ COMPLETE

### 3.2/3.4 Ticket Transitions & History
**Status:** ✅ COMPLETE (`8e579de`)
- TicketStatusHistory recorded on ALL status changes (not just some)
- `isActive` validation for members (inactive members blocked)
- Auto-archive: `completedAt`/`closedAt` fields managed automatically
- SLA queries limited to 7-day window

### 3.5-3.7 KB, Assets, Export
**Status:** ✅ COMPLETE (`377fb0d`)
- KB CRUD: pagination, max length validation, category existence check, rate limiting
- Asset Management: pagination, validation, FK guard on delete, audit logs
- Export: `canExportData` permission check enforced

### 3.8 Notification Provider
**Status:** ✅ COMPLETE (`d72ec8f`)
- Added `ticket-closed` event handler in NotificationProvider (was missing)

---

## Phase 4: RBAC, Security & ITIL
**Status:** ✅ COMPLETE

### 4.1 RBAC & Security Hardening
**Status:** ✅ COMPLETE (`07e80c5`, `d64df7e`)
- Account lockout: 5 failed attempts → 15 min lockout (DB-persisted, not in-memory)
- Login rate limit: 10/15min per IP (separate from authLimiter 100/15min for refresh/logout)
- Ticket creation rate limit: 10/min per user
- Swagger UI disabled in production
- `X-Request-ID` middleware for request tracing
- `canViewAuditLogs` permission gate on audit routes
- `canViewAnalytics` permission gate on 5 analytics endpoints
- Shared `getUserPermission()` utility in `src/core/permissions.ts` (eliminated 6 duplicate implementations)
- XSS/SQLi audit: helmet + CSP + HSTS + CORS confirmed clean
- Transition enforcement: removed all direct paths to `closed` except via `resolved` → `/confirm`

### 4.2 ITIL AHT & Resolution
**Status:** ✅ COMPLETE (`d64df7e`)
- Schema fields: `inProgressAt`, `resolutionCategory`, `resolutionNotes`
- `inProgressAt` set only on first `→in_progress` transition (not subsequent)
- `resolutionCategory` + `resolutionNotes` required when moving `→resolved`
- All 6 AHT calculations use `inProgressAt→completedAt` with `createdAt→completedAt` fallback for legacy data

### 4.3 Auth & Token Hardening
**Status:** ✅ COMPLETE (Phase 1.1 tasks)
- Opaque refresh tokens in DB (server-side revocation + rotation)
- Token stored in `sessionStorage` only (not `localStorage`)
- API interceptor: `code: 'FORBIDDEN'` matching (no fragile string heuristics)
- `logoutGuard` singleton — never resets, prevents race condition
- Auth route limiter isolation: `loginLimiter` (10/15min) ONLY on `POST /login`

---

## Hotfixes & Critical Fixes

| Commit | Issue | Fix |
|---|---|---|
| `e48c3e1` | `window.alert()` in TicketDetailsPage | Replaced with `addNotification()` toast |
| `e48c3e1` | Archive enabled for non-resolved/closed | Disabled unless resolved/closed + backend validation |
| `17dc949` | Analytics export returned raw tickets | Now exports Agent Performance metrics with SLA |
| `17dc949` | Fake "+12%" badge on KPIs | Removed |
| `e2fc691` | Auth infinite loop (403 on dashboard) | Business logic 403s (`FORBIDDEN`) skip refresh immediately |
| `e2fc691` | Dashboard KPI `undefinedh` | Safe fallback: `typeof value === 'number'` check |
| `e7a49c6` | Rate limiter escalation | 3-layer defense: ErrorBanner retry cap (3), api.ts 429 guard, backend isolation |
| `ca60f1b` | Docker seed non-idempotent | Seed checks existing users before inserting |
| `ca60f1b` | Docker healthcheck failing | Added `start_period: 60s` + wget install |
