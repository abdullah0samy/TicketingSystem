# ABCH Hospital Ticketing CRM — Security & Architecture Audit

**Date**: 2026-06-10
**Scope**: Full-stack audit covering authentication, authorization, API contracts, bilingual support, data integrity, real-time events, and security hardening.

---

## Table of Contents

1. [Authentication & Session Management](#1-authentication--session-management)
2. [Authorization & RBAC](#2-authorization--rbac)
3. [Data Validation & Sanitization](#3-data-validation--sanitization)
4. [File Upload Security](#4-file-upload-security)
5. [Rate Limiting & DOS Protection](#5-rate-limiting--dos-protection)
6. [Data Integrity & Prisma Schema](#6-data-integrity--prisma-schema)
7. [Real-Time Events (Socket.io)](#7-real-time-events-socketio)
8. [CRON Jobs & Background Jobs](#8-cron-jobs--background-jobs)
9. [Error Handling & Logging](#9-error-handling--logging)
10. [Cross-Cutting Concerns](#10-cross-cutting-concerns)
11. [Section A — Role Journey](#11-section-a--role-journey)
12. [Section B — API Contract](#12-section-b--api-contract)
13. [Section C — Arabic / Bilingual](#13-section-c--arabic--bilingual)

---

## 1. Authentication & Session Management

### 1.1 JWT Implementation (`src/modules/auth/routes.ts`)

| Item | Status | Details |
|------|--------|---------|
| Access token signing | ✅ | RS256 via `jose` library |
| Access token expiry | ✅ | 15 minutes (`15m`) |
| Refresh token | ✅ | HTTP-only cookie, 7-day expiry |
| Token refresh endpoint | ✅ | `POST /api/auth/refresh` — verifies refresh token, issues new pair |
| Token revocation | ⚠️ | No blocklist; compromised refresh tokens remain valid until expiry |
| Logout | ✅ | Clears refresh cookie + client-side token removal |
| Auto-login on page load | ✅ | Refreshes via `POST /api/auth/refresh` in App.tsx |

### 1.2 Session Security

| Item | Status | Details |
|------|--------|---------|
| HTTP-only cookie | ✅ | `httpOnly: true` |
| Secure flag | ✅ | `secure: true` |
| SameSite | ✅ | `sameSite: 'strict'` |
| Path restriction | ✅ | `path: '/api/auth'` |
| CSRF protection | ❌ **MISSING** | No CSRF token on mutating endpoints. An attacker who XSS-es another page can forge authenticated requests. |

**Recommendation**: Implement CSRF tokens or use `SameSite: lax` + `Origin`/`Referer` header validation on all state-changing endpoints. Double-Submit Cookie or `csrf-csrf` middleware are viable options.

---

## 2. Authorization & RBAC

### 2.1 Authentication Middleware (`src/core/middleware/auth.ts`)

| Item | Status | Details |
|------|--------|---------|
| Token extraction | ✅ | From `Authorization: Bearer <token>` header |
| Token verification | ✅ | Verifies RS256 signature + `exp` claim |
| User enrichment | ✅ | Fetches user from DB and attaches to `req.user` |
| Inactive user check | ✅ | Returns 403 if `user.isActive === false` |
| Error on missing token | ❌ | Falls through without error — routes must explicitly check `req.user` |
| Blacklist check | ❌ | No token blacklist/revocation check |

The `authenticate` middleware silently passes `next()` if no token is present. Route handlers that call `authenticate` must check `req.user` themselves or rely on downstream guards. This is a pattern issue — some routes may assume `req.user` is always present.

### 2.2 Authorization Middleware (`src/core/middleware/authorize.ts`)

| Item | Status | Details |
|------|--------|---------|
| Role gating | ✅ | `authorize(['super_admin'])` accepts an array of roles |
| Permission cache | ✅ | In-memory with 30s TTL |
| Department overrides | ✅ | User-level permission overrides supported |
| Frontend guards | ❌ | **All admin pages lack frontend route guards** (see Section A) |

### 2.3 `checkTicketPermission` Middleware

| Item | Status | Details |
|------|--------|---------|
| Permission resolution | ✅ | Checks `role.permissions`, then user overrides |
| Creator passthrough | ✅ | Ticket creator can always view/comment |
| Department scoping | ⚠️ | Some endpoints check dept membership, others rely only on permission flags |
| Supervisor dept access | ✅ | Can view own department tickets |
| End_user isolation | ✅ | Can only view own tickets |

---

## 3. Data Validation & Sanitization

### 3.1 Zod Schemas

| Module | Validation | Trim/Strip | Notes |
|--------|-----------|-----------|-------|
| Auth | ✅ | ✅ `z.string().trim()` | Login/register schemas present |
| Tickets | ✅ | ✅ | Full create/update/status schemas |
| Admin (buildings, floors, depts, etc.) | ✅ | ✅ | All CRUD endpoints validated |
| Knowledge base | ✅ | ✅ | Article/category schemas present |
| Assets | ✅ | ✅ | Create/update schemas present |
| Team notes | ✅ | ✅ | Note/comments validated |
| Profile | ✅ | ✅ | Update profile validated |

### 3.2 XSS Prevention

| Item | Status | Details |
|------|--------|---------|
| Input validation | ✅ | Zod rejects unexpected types |
| Output encoding | ⚠️ | No HTML sanitization on user-generated content displayed via `dangerouslySetInnerHTML` |
| Hidden input fields | ❌ | `roomExtension`, `badgeNumber` set as `hidden` input type — easily manipulated by client |

**Note**: Hidden input fields (`roomExtension`, `badgeNumber`) are set via `value` attributes. While validation exists on the backend, a malicious actor with devtools can modify these. Not a critical issue since backend validates, but worth noting.

---

## 4. File Upload Security

### 4.1 Upload Configuration (`src/modules/uploads/routes.ts`)

| Item | Status | Details |
|------|--------|---------|
| File type whitelist | ✅ | `multer` `fileFilter` restricts to `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `text/csv`, `application/vnd.openxmlformats` |
| File size limit | ✅ | 10MB via `limits.fileSize` |
| Upload directory | ⚠️ | Writes to `process.cwd() + '/uploads/'` — ensure this is not web-accessible without proper static file configuration |
| Filename sanitization | ❌ | Uses `uuid` prefix but keeps original filename via `originalname` stored in DB — potential for path traversal if filename contains `../` |
| MIME type validation | ✅ | Checked during upload |
| Content-type verification | ❌ | No magic byte verification — a `polyglot` file with fake extension could pass |

**Recommendation**: Add magic byte verification for image uploads and sanitize stored filenames to prevent path traversal.

---

## 5. Rate Limiting & DOS Protection

### 5.1 Rate Limiters

| Endpoint | Rate Limit | Status | Notes |
|----------|-----------|--------|-------|
| Auth (login) | 5 req/15min per IP | ✅ | `loginLimiter` |
| Auth (register) | 3 req/60min per IP | ✅ | `registerLimiter` |
| Ticket creation | 30 req/15min per user | ✅ | `ticketLimiter` |
| Search | 30 req/15min per user | ✅ | `searchLimiter` |
| Analytics | 60 req/15min per user | ✅ | `analyticsLimiter` |
| Upload | 10 req/15min per user | ✅ | `uploadLimiter` |
| General API | 100 req/15min per IP | ✅ | General limiter on all `/api` routes |

**Note**: Rate limiters use `express-rate-limit` with in-memory store. In multi-instance deployments, this will not be effective unless a shared store (Redis) is configured.

---

## 6. Data Integrity & Prisma Schema

### 6.1 Cascade & Delete Behavior

| Relation | On Delete | Status |
|----------|-----------|--------|
| `Ticket → Message` | `cascade` | ✅ Orphaned comments removed with ticket |
| `Ticket → Attachment` | `cascade` | ✅ |
| `Ticket → AuditLog` | `cascade` | ✅ |
| `Ticket → Transfer` | `cascade` | ✅ |
| `Ticket → TicketLink` | `cascade` | ✅ |
| `User → Ticket (createdBy)` | `setNull` on creatorId | ⚠️ Creator becomes null; use `prisma.user.delete()` with `soft-delete` pattern |
| `User → Ticket (assignedTo)` | `setNull` on assigneeId | ⚠️ Same concern |
| `Department → Ticket` | `setNull` on departmentId | ✅ Acceptable |
| `Department → User` | `setNull` on departmentId | ⚠️ Users become orphaned (no department) |
| `Asset → Ticket` | `setNull` | ✅ |

### 6.2 Soft Deletes

| Model | deletedAt | Status |
|-------|-----------|--------|
| User | ✅ | All queries filter `WHERE deletedAt IS NULL` |
| Department | ✅ | |
| Building | ✅ | |
| Floor | ✅ | |
| TicketType | ✅ | |
| Asset | ✅ | |
| KnowledgeArticle | ✅ | |
| KnowledgeCategory | ✅ | |

### 6.3 Unique Constraints & Indexing

| Item | Status | Details |
|------|--------|---------|
| `User.badgeNumber` unique | ✅ | |
| `User.email` unique | ✅ | |
| `User.username` unique | ✅ | |
| `Ticket.ticketNumber` unique | ✅ | Auto-generated via `nanoid` |
| `Department.nameEn` + `nameAr` unique | ✅ | |
| `Building.nameEn` + `nameAr` unique | ✅ | |
| `Floor` building+name unique | ✅ | |
| `TicketType` name+department unique | ✅ | |
| Index on `ticket.status` | ✅ | For dashboard filtering |
| Index on `ticket.createdAt` | ✅ | For date-range queries |
| Index on `ticket.deletedAt` | ✅ | For soft-delete filtering |
| Index on `ticket.departmentId` | ✅ | For department queries |
| Composite index `(departmentId, status, createdAt)` | ❌ | Would improve dashboard/reporting performance |
| Index on `auditLog.createdAt` | ✅ | |
| Index on `message.ticketId` | ✅ | |

### 6.4 BigInt Serialization

Fixed at startup via `BigInt.prototype.toJSON = function() { return this.toString(); }` — prevents JSON serialization errors when Prisma returns `BigInt` for aggregated counts.

---

## 7. Real-Time Events (Socket.io)

### 7.1 Server (`src/core/socket.ts`)

| Item | Status | Details |
|------|--------|---------|
| Authentication | ✅ | Middleware verifies JWT + fetches user before allowing connection |
| Room join | ✅ | Users join `dept-{id}`, `user-{id}`, `ticket-{id}` rooms |
| Events emitted | ✅ | `new-ticket`, `ticket-status-updated`, `ticket-assigned`, `new-comment`, `sla-warning`, `sla-breach` |
| Namespace isolation | ❌ | All events on default namespace `/` |

### 7.2 Client (`src/components/NotificationProvider.tsx`)

| Item | Status | Details |
|------|--------|---------|
| Connection | ✅ | Connects on auth, disconnects on logout |
| Event listeners | ✅ | Listens for all server events |
| Error handling | ✅ | `connect_error`, `disconnect` events handled |
| Reconnection | ✅ | Socket.io built-in reconnection |
| Custom events | ✅ | Dispatches `ws:*` CustomEvents for data refresh |

---

## 8. CRON Jobs & Background Jobs

### 8.1 CRON Schedules (`src/core/cron.ts`)

| Schedule | Job | Status | Details |
|----------|-----|--------|---------|
| `0 3 * * *` | Delete expired export files | ✅ | Files >24h old + DB records |
| `*/5 * * * *` | SLA breach/warning checks | ⚠️ | Queries all open tickets every 5min; could be optimized with flag-based tracking |
| `0 4 * * *` | Auto-archive resolved/closed >30d | ✅ | Bulk update with proper audit logging |

### 8.2 SLA Check Optimization

The 5-minute SLA check iterates all tickets with status `OPEN`, `IN_PROGRESS`, `REOPENED`. On a large dataset, this full scan could become expensive. Consider adding a `lastSlaCheckedAt` timestamp or using a priority queue.

### 8.3 BullMQ Integration

BullMQ + Redis dependencies are present in `package.json`. The CRON jobs currently run in-process (not via BullMQ). If the app scales to multiple instances, BullMQ should be used to prevent duplicate SLA checks and archive operations.

---

## 9. Error Handling & Logging

### 9.1 Global Error Handler (`src/app.ts`)

| Item | Status | Details |
|------|--------|---------|
| Catch-all error middleware | ✅ | `(err, req, res, next) => {...}` |
| Zod validation errors | ✅ | Returns 400 with field-level details |
| Prisma errors | ✅ | Catches unique constraint violations, foreign key errors |
| JWT errors | ✅ | `JWTExpired`, `JWTInvalid` mapped to 401 |
| Unknown errors | ✅ | Returns 500 with generic message, logs to console |
| Stack traces in production | ❌ | Stack traces included in 500 responses — should be stripped in production |

**Important**: The error handler includes `err.stack` in JSON responses. This leaks internal paths in production. Add `NODE_ENV === 'production'` check to strip stack traces.

### 9.2 Audit Logging

| Item | Status | Details |
|------|--------|---------|
| Auth events | ✅ | Login, logout, failed login, password changes |
| Ticket mutations | ✅ | Status changes, assignments, transfers, comments |
| Admin actions | ✅ | CRUD on buildings, departments, users, roles |
| Knowledge base | ✅ | Article/category mutations |
| Asset management | ✅ | All CRUD operations logged |
| IP + User agent capture | ✅ | Captured on all auth and CRUD operations |

---

## 10. Cross-Cutting Concerns

### 10.1 CORS (`src/app.ts`)

| Item | Status | Details |
|------|--------|---------|
| Origin whitelist | ✅ | Only `process.env.CORS_ORIGIN` allowed |
| Credentials | ✅ | `credentials: true` for cookie-based refresh |
| Methods | ✅ | `GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| Allowed headers | ✅ | Specific headers listed (not wildcard) |

### 10.2 Helmet (Security Headers)

Helmet is **not** configured. Headers like `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` are not set. This leaves the app vulnerable to clickjacking, MIME-type sniffing, and other browser-side attacks.

### 10.3 Environment Variables

| Variable | Required | Default | Status |
|----------|----------|---------|--------|
| `DATABASE_URL` | ✅ | — | ✅ |
| `REDIS_URL` | ⚠️ | `redis://localhost:6379` | Default used |
| `JWT_SECRET` | ✅ | — | ✅ |
| `JWT_REFRESH_SECRET` | ✅ | — | ✅ |
| `CORS_ORIGIN` | ✅ | — | ✅ |
| `NODE_ENV` | ⚠️ | `development` | Uses default |

### 10.4 Visibility

The entire system uses in-memory stores for rate limiting and permission caching. In multi-instance or horizontal scaling scenarios:
- Rate limits reset per instance
- Permission cache is stale per instance
- BullMQ queues become necessary

### 10.5 Missing CSRF

**Severity**: Medium-High
**Impact**: Any XSS vulnerability on a same-site sibling application, or through user-generated content, can forge authenticated requests via the user's session cookie.
**Mitigation**: Implement CSRF token validation on all mutating endpoints (`POST`, `PUT`, `PATCH`, `DELETE`). The `csrf-csrf` or `lusca` middleware can be integrated into `src/app.ts`.

---

## 11. Section A — Role Journey

### A1 — Frontend Route Guards

| # | Route | Page Component | Sidebar Visibility | Route Guard | Role(s) that can reach it | Mismatch? |
|---|-------|---------------|-------------------|-------------|--------------------------|-----------|
| 1 | `/dashboard` | DashboardPage | Everyone | None (`if (!user)`) | any authenticated | ✅ OK |
| 2 | `/tickets/new` | NewTicketPage | Everyone | None | any authenticated | ✅ OK |
| 3 | `/inbox` | InboxPage | Everyone | None | any authenticated | ✅ OK |
| 4 | `/my-tickets` | MyTicketsPage | Everyone | None | any authenticated | ✅ OK |
| 5 | `/transferred` | TransferredPage | Everyone | None | any authenticated | ✅ OK |
| 6 | `/archive` | ArchivePage | Everyone | None | any authenticated | ✅ OK |
| 7 | `/analytics` | AnalyticsPage | Everyone | None | any authenticated | ✅ OK |
| 8 | `/team-feed` | TeamFeedPage | Everyone | None | any authenticated | ✅ OK |
| 9 | `/knowledge` | KnowledgeBasePage | Everyone | None | any authenticated | ✅ OK |
| 10 | `/profile` | UserProfilePage | Everyone | None | any authenticated | ✅ OK |
| 11 | `/admin/buildings` | BuildingsPage | super_admin only | **NONE** | any authenticated can navigate here | ⚠️ **MISMATCH** — POST/PUT/DELETE super_admin only |
| 12 | `/admin/floors` | FloorsPage | super_admin only | **NONE** | any authenticated can navigate here | ⚠️ **MISMATCH** |
| 13 | `/admin/departments` | DepartmentsPage | super_admin only | **NONE** | any authenticated can navigate here | ⚠️ **MISMATCH** |
| 14 | `/admin/ticket-types` | TicketTypesPage | super_admin only | **NONE** | any authenticated can navigate here | ⚠️ **MISMATCH** |
| 15 | `/admin/users` | UserManagementPage | super_admin only | **NONE** | any authenticated can navigate here | ⚠️ **MISMATCH** |
| 16 | `/admin/roles` | RoleManagementPage | super_admin only | **NONE** | any authenticated can navigate here | ⚠️ **MISMATCH** |
| 17 | `/admin/assets` | AssetManagementPage | super_admin only | **NONE** | any authenticated can navigate here | ⚠️ **MISMATCH** |
| 18 | `/admin/audit` | AuditLogPage | super_admin only | **NONE** | any authenticated can navigate here | ⚠️ **MISMATCH** |

### A2 — Backend Endpoint Authorization by Role

| # | Method | Endpoint | Middleware | super_admin | supervisor | agent | end_user | Notes |
|---|--------|---------|-----------|-------------|------------|-------|----------|-------|
| 1 | POST | `/api/auth/login` | none | ✅ | ✅ | ✅ | ✅ | public |
| 2 | POST | `/api/auth/refresh` | none | ✅ | ✅ | ✅ | ✅ | public |
| 3 | POST | `/api/auth/logout` | none | ✅ | ✅ | ✅ | ✅ | public |
| 4 | GET | `/api/users/me` | `authenticate` | ✅ | ✅ | ✅ | ✅ | |
| 5 | PUT | `/api/users/avatar` | `authenticate` | ✅ | ✅ | ✅ | ✅ | |
| 6 | PUT | `/api/users/profile` | `authenticate` | ✅ | ✅ | ✅ | ✅ | |
| 7 | GET | `/api/admin/buildings` | `authenticate` | ✅ | ✅ | ✅ | ✅ | |
| 8 | POST | `/api/admin/buildings` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 9 | GET | `/api/admin/floors` | `authenticate` | ✅ | ✅ | ✅ | ✅ | |
| 10 | POST | `/api/admin/floors` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 11 | GET | `/api/admin/departments` | `authenticate` | ✅ | ✅ | ✅ | ✅ | |
| 12 | POST | `/api/admin/departments` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 13 | GET | `/api/admin/ticket-types` | `authenticate` | ✅ | ✅ | ✅ | ✅ | |
| 14 | POST | `/api/admin/ticket-types` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 15 | GET | `/api/admin/users` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 16 | POST | `/api/admin/users` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 17 | GET | `/api/admin/roles` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 18 | GET | `/api/admin/permissions` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 19 | POST | `/api/tickets` | `authenticate` | ✅ | ✅ | ✅ | ✅ | |
| 20 | GET | `/api/tickets/my` | `authenticate` | ✅ | ✅ | ✅ | ✅ | own tickets only |
| 21 | GET | `/api/tickets/department` | `authenticate` | all depts | own dept | own dept | N/A (no dept) | checks canViewAllDeptTickets |
| 22 | GET | `/api/tickets/search` | `authenticate` + `searchLimiter` | all tickets | dept+own | dept+own | own tickets | role-scoped |
| 23 | GET | `/api/tickets/:id` | `authenticate` | ✅ | ✅ if dept | ✅ if dept | own tickets | creator/assigned/dept member |
| 24 | PUT | `/api/tickets/:id/status` | `checkTicketPermission('canChangeStatus')` | ✅ | depends on perm | depends on perm | ❌ | |
| 25 | PUT | `/api/tickets/:id/assign` | `checkTicketPermission('canAssignTickets')` | ✅ | depends on perm | depends on perm | ❌ | |
| 26 | POST | `/api/tickets/:id/comments` | `authenticate` | ✅ | ✅ | ✅ | ✅ | lock checks for closed/resolved |
| 27 | PUT | `/api/tickets/:id/confirm` | `authenticate` | ✅ | ❌ (unless creator) | ❌ (unless creator) | ✅ if creator | creator only |
| 28 | PUT | `/api/tickets/:id/due-date` | `authenticate` | ✅ | ✅ if dept | ❌ | ❌ | checks dept member |
| 29 | PUT | `/api/tickets/:id/type` | `authenticate` | ✅ | ✅ if dept | ❌ | ❌ | checks dept member |
| 30 | PUT | `/api/tickets/:id/archive` | `checkTicketPermission('canArchiveTickets')` | ✅ | ✅ default | ❌ default | ❌ | default: supervisor |
| 31 | PATCH | `/api/tickets/:id` | `authenticate` + inline super_admin check | ✅ | ❌ | ❌ | ❌ | |
| 32 | GET | `/api/analytics/dashboard-summary` | `authenticate` | ✅ | ✅ | ✅ | ✅ | scoped by role |
| 33 | GET | `/api/analytics/stats` | `authenticate` | ✅ | ✅ | ✅ | ✅ | scoped |
| 34 | GET | `/api/analytics/department-performance` | `authorize(['super_admin','supervisor'])` | ✅ | ✅ | ❌ | ❌ | |
| 35 | GET | `/api/analytics/recent-activity` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 36 | GET | `/api/analytics/agent-performance` | `authorize(['super_admin','supervisor'])` | ✅ | ✅ | ❌ | ❌ | |
| 37 | GET | `/api/analytics/aht` | `authenticate` | ✅ | ✅ | ✅ | ✅ | scoped |
| 38 | GET/POST | `/api/assets` | `authenticate` / `authorize(['super_admin','supervisor'])` | ✅ | POST/PUT only | ❌ | ❌ | GET: any auth |
| 39 | DELETE | `/api/assets/:id` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 40 | GET | `/api/knowledge/articles` | `authenticate` | ✅ | ✅ | ✅ | ✅ | all read |
| 41 | POST/PUT/DELETE | `/api/knowledge/*` | `checkKbPermission()` | ✅ | depends on perm | depends on perm | ❌ | default: false |
| 42 | GET | `/api/knowledge/suggest` | `authenticate` | ✅ | ✅ | ✅ | ✅ | |
| 43 | GET/POST | `/api/team-notes` | `authenticate` | ✅ | ✅ if dept | ✅ if dept | ❌ if no dept | dept-scoped |
| 44 | GET | `/api/audit` | `authorize(['super_admin'])` | ✅ | ❌ | ❌ | ❌ | |
| 45 | GET | `/api/profile` | `authenticate` | ✅ | ✅ | ✅ | ✅ | own profile |

**Key mismatches**: Items 11–18 (all admin pages) have no frontend route guard. A non-super_admin who navigates to `/admin/users` sees the page component, which will fail on the API call with a 403 but the page will render partially with error state.

---

## 12. Section B — API Contract

| # | Frontend File | API Call | Fields Read from Response | Backend Returns? | Match? | Paginated? |
|---|--------------|----------|--------------------------|-----------------|--------|-----------|
| 1 | App.tsx:110 | `GET /api/users/me` | `user` object → fed to `setAuth()` | ✅ Prisma User model (excludes passwordHash) via `findUnique` | ✅ | N/A |
| 2 | Login.tsx:24 | `POST /api/auth/login` | `data.user`, `data.accessToken` | ✅ routes.ts returns `{ user, accessToken }` | ✅ | N/A |
| 3 | NewTicketPage.tsx:86 | `GET /api/admin/buildings` | `bData` → `b.id`, `b.nameAr`, `b.nameEn`, `b.isActive` | ✅ `filter(b => b.isActive)` | ✅ | ❌ no pagination on buildings |
| 4 | NewTicketPage.tsx:87 | `GET /api/admin/departments` | `dData` → `d.id`, `d.nameAr`, `d.nameEn`, `d.deptType`, `d.isActive` | ✅ filters `isActive && (RECEIVER_ONLY\|\|BOTH)` | ✅ | ❌ no pagination |
| 5 | NewTicketPage.tsx:88 | `GET /api/admin/ticket-types` | `tData` → `tt.id`, `tt.nameAr`, `tt.nameEn`, `tt.departmentId`, `tt.color`, `tt.isActive` | ✅ filters `tt.isActive` | ✅ | ❌ no pagination |
| 6 | NewTicketPage.tsx:89 | `GET /api/assets` | `aData` → `a.id`, `a.name`, `a.serialNumber`, `a.status` | ✅ filters `a.status === 'active'` | ✅ | ❌ no pagination |
| 7 | NewTicketPage.tsx:110 | `GET /api/admin/floors` | `data` → `f.id`, `f.nameAr`, `f.nameEn`, `f.buildingId`, `f.isActive` | ✅ filters `f.buildingId === selected && f.isActive` | ✅ | ❌ no pagination |
| 8 | NewTicketPage.tsx:137 | `GET /api/knowledge/suggest?q=` | `data` → `a.id`, `a.titleAr`, `a.titleEn`, `a.snippetAr`, `a.snippetEn` | ✅ returns `{id, titleAr, titleEn, snippetAr, snippetEn}` | ✅ | N/A (top 3) |
| 9 | NewTicketPage.tsx:245 | `POST /api/tickets` | `data.ticketNumber` (from `ticketCreatedSuccess`) | ✅ returns created ticket with `ticketNumber` | ✅ | N/A |
| 10 | NewTicketPage.tsx:154 | `POST /api/uploads` | `data` → `fileName`, `fileUrl`, `fileSize`, `mimeType` | ✅ returns `{fileName, fileUrl, fileSize, mimeType}` | ✅ | N/A |
| 11 | DashboardPage.tsx:148 | `GET /api/analytics/dashboard-summary` | `data.stats.{total,pending,resolved,open,overdue,slaBreaches,avgResolutionTimeHours,resolvedInternal,resolvedExternal}` | ✅ matches response shape at routes.ts:138-145 | ✅ | N/A |
| 12 | DashboardPage.tsx:148 | same call | `data.statusDistribution[{status,count}]` | ✅ routes.ts:146 | ✅ | N/A |
| 13 | DashboardPage.tsx:148 | same call | `data.priorityDistribution[{priority,count}]` | ✅ routes.ts:147 | ✅ | N/A |
| 14 | DashboardPage.tsx:148 | same call | `data.departmentPerformance[{nameAr,nameEn,count}]` | ✅ routes.ts:148 | ✅ | N/A |
| 15 | DashboardPage.tsx:148 | same call | `data.recentActivity[{log.id,log.user.{fullNameAr,fullNameEn,avatarUrl},log.action,log.createdAt}]` | ✅ routes.ts:149 | ✅ | N/A |
| 16 | DashboardPage.tsx:148 | same call | `data.agentPerformance[{id,nameEn,nameAr,department,resolvedCount,avgResolutionTimeHours,avgResponseTimeHours,slaAdherenceRate}]` | ✅ routes.ts:150 | ✅ | N/A |
| 17 | DashboardPage.tsx:148 | same call | `data.exportHistory[{exp.id,exp.fileName,exp.dateFrom,exp.dateTo,exp.ticketCount,exp.createdAt,exp.fileUrl,exp.exportedBy.{fullNameAr,fullNameEn}}]` | ✅ routes.ts:151 | ✅ | N/A |
| 18 | DashboardPage.tsx:148 | same call | `data.assetSummary.{total,active,maintenance,retired}` | ✅ routes.ts:152-157 | ✅ | N/A |
| 19 | DashboardPage.tsx:166 | `GET /api/analytics/aht` | `aht.overallAhtHours`, `aht.totalResolved`, `aht.ahtByPriority[...]`, `aht.ahtByDepartment[...]` | ✅ analytics routes `/aht` endpoint | ✅ | N/A |
| 20 | DashboardPage.tsx:179 | `GET /api/analytics/exports` | `data` → array of exports | ✅ | ✅ | ❌ **no pagination on exports** — can grow |
| 21 | InboxPage.tsx:72 | `GET /api/admin/users` | `data` → `u.id`, `u.fullNameAr`, `u.fullNameEn`, `u.departmentId` | ✅ filters by user's department if not super_admin | ✅ | ❌ **no pagination on users list** |
| 22 | InboxPage.tsx:102 | `GET /api/tickets/department?status=&priority=&search=&startDate=&endDate=&creatorName=&agentId=&page=&limit=` | `data.tickets[{id,ticketNumber,subject,status,priority,createdAt,creatorName,ticketType.{nameAr,nameEn,color},assignedTo.{fullNameAr,fullNameEn},slaDeadline,dueDate}]` | ✅ routes.ts includes `createdBy`, `ticketType`, `assignedTo` in include | ✅ | ✅ paginated (limit default 50, max 100) |
| 23 | InboxPage.tsx:102 | same call | `data.pagination.{total,page,limit,pages}` | ✅ routes.ts:434-440 | ✅ | ✅ |
| 24 | MyTicketsPage.tsx:60 | `GET /api/tickets/my?page=&limit=&search=` | `data.tickets[{id,ticketNumber,subject,status,priority,createdAt,department.{nameAr,nameEn},ticketType.{nameAr,nameEn,color}}]` | ✅ routes.ts includes `department`, `ticketType`, `assignedTo` | ✅ | ✅ paginated (limit default 20, max 100) |
| 25 | MyTicketsPage.tsx:60 | same call | `data.pagination.{pages,total}` | ✅ routes.ts:287-293 | ✅ | ✅ |
| 26 | TicketDetailsPage.tsx:323 | `GET /api/tickets/:id` | Full ticket object (30+ fields including nested relations) | ✅ routes.ts:682-710 | ✅ | N/A (single ticket) |
| 27 | TicketDetailsPage.tsx:341 | `GET /api/admin/users` | agents filtered by `departmentId === ticketData.departmentId` | ✅ | ✅ | ❌ **no pagination on users** |
| 28 | TicketDetailsPage.tsx:353 | `GET /api/admin/departments` | departments for transfer dropdown | ✅ | ✅ | ❌ no pagination |
| 29 | TicketDetailsPage.tsx:363 | `GET /api/admin/ticket-types` | types filtered by `tt.isActive` | ✅ | ✅ | ❌ no pagination |
| 30 | TicketDetailsPage.tsx:264 | `GET /api/tickets/department?status=all` | related tickets filtered by ID match | ✅ | ✅ | ✅ |
| 31 | TicketDetailsPage.tsx:277 | `GET /api/tickets/department?search=&status=all` | tickets to link (searched) | ✅ | ✅ | ✅ |
| 32 | TicketDetailsPage.tsx:506 | `PUT /api/tickets/:id/status` | `updatedTicket` → used to trigger refetch | ✅ returns updated ticket | ✅ | N/A |
| 33 | ArchivePage.tsx:38 | `GET /api/tickets/archived?page=&limit=&search=` | `data.tickets[{id,ticketNumber,subject,status,priority,archivedAt,creatorName,ticketType.{nameAr,nameEn,color},assignedTo.{fullNameAr,fullNameEn}}]` | ✅ routes.ts includes `department`, `ticketType`, `createdBy`, `assignedTo` | ✅ | ✅ (limit default 20, max 100) |
| 34 | TransferredPage.tsx:44 | `GET /api/tickets/transferred?page=&limit=&search=` | `data.tickets[{id,ticketNumber,subject,status,priority,createdAt,creatorName,transfers[...]}]` | ✅ routes.ts includes `transfers` with nested relations | ✅ | ✅ (limit default 20, max 100) |
| 35 | TransferredPage.tsx:44 | same call | `data.pagination.{total,page,limit,pages}` | ✅ | ✅ | ✅ |
| 36 | GlobalSearch.tsx:61 | `GET /api/tickets/search?q=&limit=5` | `data.tickets[{id,ticketNumber,subject,status,createdAt,creatorName}]` | ✅ | ✅ | ✅ (limit hardcoded 5, schema max 20) |
| 37 | AnalyticsPage.tsx:72 | `GET /api/analytics/dashboard-summary` | `data.stats.{...}` + `data.agentPerformance[...]` | ✅ same as DashboardPage | ✅ | N/A |
| 38 | Settings/Theme toggle | (none — client-side only) | — | — | — | — |
| 39 | AuditLogPage | `GET /api/audit` | `data.logs[{...user, ...department, ...ticket}]` + pagination | ✅ | ✅ | ✅ (max 100) |
| 40 | AuditLogPage | `GET /api/audit/actions` | `data` → array of action strings | ✅ | ✅ | N/A |
| 41 | TeamFeedPage | `GET /api/team-notes` | team notes with author, comments, likes | ✅ | ✅ | ❌ **no pagination check needed** (limited data) |
| 42 | KnowledgeBasePage | `GET /api/knowledge/articles` | articles with category, author | ✅ | ✅ | ❌ **no pagination** — all articles returned |
| 43 | KnowledgeBasePage | `GET /api/knowledge/categories` | categories with `_count.articles` | ✅ | ✅ | ❌ no pagination |
| 44 | KnowledgeBasePage | `GET /api/knowledge/search?q=` | search results | ✅ | ✅ | ❌ **no pagination** — all results |

**Unpaginated endpoints returning potentially unbounded data**:
1. `GET /api/analytics/exports` — export history grows unbounded (until 3AM cleanup)
2. `GET /api/knowledge/articles` — knowledge base articles
3. `GET /api/knowledge/search` — search results
4. `GET /api/admin/buildings` — buildings (bounded, low count)
5. `GET /api/admin/departments` — departments (bounded, low count)
6. `GET /api/admin/ticket-types` — ticket types (bounded, low count)
7. `GET /api/admin/users` — users can grow large

---

## 13. Section C — Arabic / Bilingual

### C1 — Hardcoded English Strings in JSX (visible to end_user or supervisor)

| # | File | Line(s) | String | Type | Bilingual? |
|---|------|---------|--------|------|-----------|
| 1 | TicketDetailsPage.tsx | 316, 320, 324, 338, 345, 352 | `'N/A'` | fallback for creatorPhone, creatorExtension, creatorDeptName, buildingName, floorName, roomExtension | ❌ **not translated** |
| 2 | TicketDetailsPage.tsx | 565 | `'Ticket not found or access denied'` | error state | ❌ **not translated** |
| 3 | TicketDetailsPage.tsx | 676 | `'Unassigned'` | status text | ❌ not translated |
| 4 | AssetManagementPage.tsx | 253, 259 | `'N/A'` | fallback for asset.location, department.name | ❌ |
| 5 | NewTicketPage.tsx | 356 | `'e.g. Room 402'` | input placeholder | ❌ not translated |
| 6 | NewTicketPage.tsx | 106 | `"00000"` | input placeholder | ❌ not translated |
| 7 | InboxPage.tsx | 676 | `'Unassigned'` | status text | ❌ not translated |
| 8 | BuildingsPage.tsx | — | `'Are you sure you want to delete this building?'` | confirm dialog | ❌ **not translated** |
| 9 | FloorsPage.tsx | 92 | `'Are you sure you want to delete this floor?'` | confirm dialog | ❌ **not translated** |
| 10 | TicketTypesPage.tsx | 105 | `'Are you sure you want to delete this ticket type?'` | confirm dialog | ❌ **not translated** |
| 11 | UserManagementPage.tsx | 172 | `` `Are you sure you want to ${user.isActive ? 'deactivate' : 'activate'} this user?` `` | confirm dialog | ❌ **not translated** |
| 12 | KnowledgeBasePage.tsx | 211 | `'Are you sure you want to delete this article?'` | confirm dialog | ❌ **not translated** |
| 13 | KnowledgeBasePage.tsx | 244 | `'Delete this category? This only works if it has no articles.'` | confirm dialog | ❌ **not translated** |
| 14 | KnowledgeBasePage.tsx | 724 | `"Arabic Name / الاسم بالعربي"` | placeholder | ❌ partially — has Arabic fallback but English first |
| 15 | KnowledgeBasePage.tsx | 733 | `"English Name"` | placeholder | ❌ not Arabic |
| 16 | RoleManagementPage.tsx | 283 | `"What can this role do?"` | placeholder | ❌ not translated |

### C2 — Untranslated Error Messages (via `alert()`)

| # | File | Line(s) | Message | Bilingual? |
|---|------|---------|---------|-----------|
| 1 | TicketDetailsPage.tsx | 396 | `error?.message \|\| 'Error archiving ticket'` | ❌ |
| 2 | KnowledgeBasePage.tsx | 253 | `'Failed to delete. Ensure category is empty.'` | ❌ |
| 3 | UserManagementPage.tsx | 131 | `data.message \|\| 'Error saving user'` | ❌ |
| 4 | UserManagementPage.tsx | 159 | `'Password reset successfully'` | ❌ |
| 5 | UserManagementPage.tsx | 161 | `'Error resetting password'` | ❌ |
| 6 | RoleManagementPage.tsx | 96 | `'Error saving role'` | ❌ |
| 7 | RoleManagementPage.tsx | 123 | `data.message \|\| 'Error deleting role'` | ❌ |

### C3 — Backend Error Messages (English only, no i18n)

All backend error messages across all route files are in English only. Examples:
- `routes.ts:748` — `'Ticket is locked. Only Super Admin can modify closed or resolved tickets via this endpoint.'`
- `routes.ts:771` — `'Invalid status transition: ${oldStatus} → ${status}'`
- `routes.ts:786` — `'A ticket must be assigned to an agent before it can be resolved'`
- `routes.ts:798` — `'Issue Type must be selected before resolving or closing the ticket'`
- `routes.ts:161` — `'Target department not found'`
- All analytics routes: `'Error fetching dashboard summary'`

Backend errors are **never translated** — they are returned in English to the frontend, which passes them through `alert()` or `error?.message`. An Arabic user will see English error messages.

### C4 — Search: Arabic Text Handling (tashkeel / Alef variants)

| Search Location | Implementation | `contains` behavior | Tashkeel handling? | Alef variants? |
|----------------|---------------|--------------------|--------------------|----------------|
| `GET /api/tickets/my` | Prisma `{ contains: searchStr }` | PostgreSQL `LIKE %searchStr%` | ❌ No — exact character match only. Searching `"مدرسة"` won't match `"مَدْرَسَة"` | ❌ No — `"أحمد"`, `"احمد"`, `"آحمد"` are different strings |
| `GET /api/tickets/department` | Prisma `{ contains: searchStr }` | same | ❌ | ❌ |
| `GET /api/tickets/search` | Prisma `{ contains: searchStr }` - ticketNumber, subject, description, creatorName | same | ❌ | ❌ |
| `GET /api/tickets/archived` | Prisma `{ contains: searchStr }` | same | ❌ | ❌ |
| `GET /api/tickets/transferred` | Prisma `{ contains: searchStr }` | same | ❌ | ❌ |
| `GET /api/knowledge/search` | Two-phase: exact word match then word-level union | PostgreSQL case-sensitive across titleAr, contentAr, titleEn, contentEn | ❌ | ❌ |
| `GET /api/knowledge/suggest` | Same two-phase search | same | ❌ | ❌ |
| GlobalSearch.tsx | `GET /api/tickets/search` (frontend) | same as backend search | ❌ | ❌ |

**Recommendation**: To handle Arabic search properly, either:
1. Use PostgreSQL `unaccent` extension for diacritic-insensitive search
2. Use `citext` extension for case-insensitive search
3. Normalize Alef variants (`أ إ آ` → `ا`) before matching
4. Remove tashkeel (diacritics) from both query and stored text

---

## Summary of Findings

### Critical
| # | Finding | File/Area | Impact |
|---|---------|-----------|--------|
| 1 | **No CSRF protection** | All mutating endpoints | Can forge requests via any XSS vector |

### High
| # | Finding | File/Area | Impact |
|---|---------|-----------|--------|
| 2 | **No frontend route guards on admin pages** | `src/App.tsx` — 8 admin routes | Non-super_admin can navigate to admin pages |
| 3 | **Stack traces in production error responses** | `src/app.ts` — error handler | Leaks internal file paths |
| 4 | **No Helmet security headers** | `src/app.ts` | Clickjacking, MIME sniffing, etc. |
| 5 | **Backend errors all English** | All route files | Arabic users see untranslated error messages |

### Medium
| # | Finding | File/Area | Impact |
|---|---------|-----------|--------|
| 6 | **File upload only checks MIME type, not magic bytes** | `src/modules/uploads/routes.ts` | Polyglot files could bypass |
| 7 | **No token blacklist** | `src/core/middleware/auth.ts` | Compromised tokens valid until expiry |
| 8 | **Unpaginated unbounded endpoints** | analytics/exports, knowledge/articles, knowledge/search, admin/users | Performance degradation |
| 9 | **Arabic search lacks tashkeel/Alef normalization** | All ticket + knowledge search routes | Arabic users may fail to find content |
| 10 | **30+ hardcoded English strings in JSX** | Multiple frontend files | Inconsistent UX for Arabic users |

### Low
| # | Finding | File/Area | Impact |
|---|---------|-----------|--------|
| 11 | `authenticate` middleware doesn't 401 on missing token | `src/core/middleware/auth.ts` | Routes must manually check req.user |
| 12 | Hidden input fields modifiable by client | NewTicketPage (roomExtension, badgeNumber) | Low — backend validates |
| 13 | No BullMQ for CRON jobs (single-instance assumption) | `src/core/cron.ts` | Duplicate execution on scale-out |
| 14 | Rate limiters are in-memory | `src/app.ts` | Per-instance only |
