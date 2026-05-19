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

---

## Phase 2: UI/UX, Typography & Dashboard Revamp
**Status:** ⚪ NOT STARTED

### 2.1 Visual Hierarchy & Theming
### 2.2 Typography
### 2.3 Dashboard Redesign
### 2.4 Spacing & Page Division

---

## Phase 3: Business Flow & Core Functionality 100% Check
**Status:** ⚪ NOT STARTED

### 3.1 The "Closed Loop" Verification
### 3.2 Component Testing
### 3.3 Modules Audit

---

## Phase 4: Strict RBAC & Security (Clean Code)
**Status:** ⚪ NOT STARTED

### 4.1 Department & User Permissions
### 4.2 Code Quality (SOLID)
### 4.3 Security (XSS/SQLi/Rate-Limiting)
