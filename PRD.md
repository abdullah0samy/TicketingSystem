# Product Requirements Document (PRD)
## ABC Hospital Help Desk System — Version II

| Field | Value |
|---|---|
| **Document Version** | 1.0 |
| **Date** | May 24, 2026 |
| **Status** | Draft |
| **Owner** | Engineering Team |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Overview](#2-product-overview)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [User Roles & Personas](#4-user-roles--personas)
5. [Functional Requirements](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Data Model Summary](#7-data-model-summary)
8. [Tech Stack](#8-tech-stack)
9. [Constraints & Assumptions](#9-constraints--assumptions)
10. [Release Roadmap](#10-release-roadmap)
11. [Open Issues & Risks](#11-open-issues--risks)

---

## 1. Executive Summary

**ABC Hospital Help Desk System v2 (ABCH-HD-II)** is an internal enterprise ticketing and service-management platform built specifically for hospital operations. It replaces fragmented, manual processes with a structured, real-time, multi-department workflow for tracking, escalating, and resolving service requests across hospital facilities.

**Key capabilities:**

- Fine-grained Role-Based Access Control (RBAC)
- SLA enforcement with automated breach alerts
- Real-time updates via WebSockets and browser push notifications
- Arabic/English bilingual interface (RTL-first)
- Knowledge base, asset tracking, team collaboration, and full audit trail

**Delivery:** Single-page React application backed by a Node.js/Express API and PostgreSQL database.

---

## 2. Product Overview

### 2.1 Problem Statement

Hospital staff across multiple departments raise service requests (IT, maintenance, medical equipment, facilities, etc.) through fragmented channels — phone calls, WhatsApp, paper forms. This causes:

- No visibility into request status for the requester
- No SLA enforcement or escalation path
- No historical audit trail or accountability
- No analytics to identify recurring issues

### 2.2 Proposed Solution

A centralized, web-based help desk platform where:

- Any staff member can submit a ticket from any device
- Each ticket is routed to the responsible department with a defined SLA
- Department staff manage, respond to, assign, and resolve tickets in real time
- Managers access analytics dashboards and audit logs
- A knowledge base reduces repeat ticket volume

### 2.3 Scope

| In Scope | Out of Scope |
|---|---|
| Internal staff ticketing | Patient-facing portals |
| Multi-department routing | External vendor integrations |
| SLA monitoring & alerts | Native mobile apps |
| Real-time per-ticket messaging | Email ticketing ingestion |
| Knowledge base (AR/EN) | Advanced AI/ML triage |
| Asset tracking | Financial or billing systems |
| Team feed / collaboration | HR or payroll integration |
| Audit logging | |
| Browser push notifications | |
| Data export (CSV/Excel) | |

---

## 3. Goals & Success Metrics

### 3.1 Business Goals

| Goal | Metric | Target |
|---|---|---|
| Centralize all service requests | % of requests submitted via system | ≥ 90% within 3 months |
| Enforce SLA compliance | % of tickets resolved before SLA deadline | ≥ 80% |
| Reduce resolution time | Average time-to-close per ticket | ↓ 30% vs. baseline |
| Improve staff satisfaction | Post-resolution rating (1–5 stars) | ≥ 4.0 average |
| Reduce repeat tickets | Knowledge base usage rate | ≥ 20% of sessions visit KB |
| Full audit compliance | % of sensitive actions logged | 100% |

### 3.2 Technical Goals

- Zero critical security vulnerabilities in production
- API response time ≤ 500 ms (p95) under normal load
- 99.5% application uptime SLA
- All unit tests passing; integration tests covering core RBAC flows

---

## 4. User Roles & Personas

### 4.1 Role Hierarchy

```
super_admin
  └── admin
        └── dept_manager
              └── agent
                    └── end_user
```

### 4.2 Persona Definitions

| Role | Who They Are | Primary Actions |
|---|---|---|
| **end_user** | General hospital staff (nurse, clerk, etc.) | Submit tickets, track own tickets, rate resolutions |
| **agent** | Department technician / specialist | View inbox, respond to tickets, update status, add notes |
| **dept_manager** | Head of a department | All agent actions + assign/transfer tickets, view dept analytics, manage team feed |
| **admin** | IT admin or facility manager | Manage users, departments, ticket types, assets, view all analytics |
| **super_admin** | System owner | All permissions — system settings, audit logs, cross-department oversight |

### 4.3 Department Types

| Type | Description |
|---|---|
| `RECEIVER_ONLY` | Can only receive tickets from other departments |
| `SENDER_ONLY` | Can only send tickets; cannot receive |
| `BOTH` | Can both send and receive tickets |

### 4.4 Permission Model

Permissions operate at two levels:

1. **Department-level** (`DeptPermissions`): Default permissions applied to all users in a department.
2. **User-level override** (`UserPermissionOverride`): Per-user exceptions that override department defaults.

| Permission Flag | Description |
|---|---|
| `canReceiveTickets` | View and work on incoming tickets |
| `canSendTickets` | Create and submit tickets to other departments |
| `canViewAllDeptTickets` | See all department tickets, not just personally assigned ones |
| `canAssignTickets` | Assign or reassign tickets to department agents |
| `canChangeStatus` | Update ticket status (e.g., `pending` → `open` → `resolved`) |
| `canTransferTickets` | Transfer tickets to another department |
| `canArchiveTickets` | Archive resolved tickets |
| `canExportData` | Export ticket data to CSV/Excel |
| `canViewAnalytics` | Access the analytics dashboard |
| `canManageTeamNotes` | Create, edit, and delete team feed posts |
| `canManageDeptUsers` | Add or remove users within the department |
| `canViewAuditLogs` | Access the audit trail |
| `canManageKnowledgeBase` | Create, edit, and deactivate knowledge base articles |

---

## 5. Functional Requirements

### 5.1 Authentication & Session Management

| ID | Requirement |
|---|---|
| AUTH-01 | Users authenticate with `badgeNumber` + password |
| AUTH-02 | JWT-based auth: short-lived access token (15 min) + long-lived refresh token (7 days) stored in an HTTP-only cookie |
| AUTH-03 | Refresh token is rotated on every use |
| AUTH-04 | `forcePasswordChange` flag forces a password reset on next login |
| AUTH-05 | Login endpoint is rate-limited to prevent brute force (5 attempts / 15 min) |
| AUTH-06 | Logout invalidates the refresh token server-side |
| AUTH-07 | Last login timestamp and IP address are recorded per user |
| AUTH-08 | Language preference (`ar` / `en`) is persisted per user profile |

### 5.2 Ticket Lifecycle

#### 5.2.1 Ticket Creation

| ID | Requirement |
|---|---|
| TKT-01 | Any authenticated user with `canSendTickets` permission can create a ticket |
| TKT-02 | A unique, human-readable ticket number is auto-generated (department prefix + sequence) |
| TKT-03 | Required fields: `description`, `departmentId` (target department) |
| TKT-04 | Optional fields: subject, ticket type, priority, building, floor, room extension, related tickets, asset, due date |
| TKT-05 | SLA deadline is automatically calculated from the department or ticket-type SLA hours at creation time |
| TKT-06 | Creator's name, phone, extension, and department are snapshotted (denormalized) at creation time |
| TKT-07 | File attachments (images, documents, voice notes) may be added at creation or at any later point |

#### 5.2.2 Ticket Status Flow

The system defines **three core operational states**. `closed` is a voluntary requester confirmation and carries no KPI weight.

```
[Requester submits]
       │
       ▼
   PENDING  ◄─────────────────────────────────┐
       │                                       │ reopen
       │ Department acknowledges ticket        │
       │ ⏱ SLA timer STARTS                   │
       │ 📊 Agent KPI tracking STARTS         │
       ▼                                       │
    OPEN                                       │
       │                                       │
       │ Agent resolves the issue              │
       │ ⏱ SLA timer STOPS                    │
       │ 📊 Agent + Dept KPI LOCKED           │
       │ 🔔 Push notification sent to requester│
       ▼                                       │
   RESOLVED ──────────────────────────────────┘
       │
       │ Requester confirms (optional)
       ▼
   CLOSED  (voluntary — no KPI impact)
```

| Status | Actor | KPI Impact | Description |
|---|---|---|---|
| `pending` | — | ⏸ Not started | Ticket created by requester; awaiting department pickup |
| `open` | Agent / Dept | ▶ SLA + Agent KPI **start** | Department acknowledges and begins work; SLA clock starts |
| `resolved` | Agent | ⏹ SLA + Agent KPI **locked** | Agent marks issue resolved; push notification sent to requester |
| `closed` | Requester *(optional)* | ✅ No KPI impact | Requester voluntarily confirms resolution and optionally leaves a rating (1–5) + feedback |

> [!IMPORTANT]
> **`in_progress` and `on_hold` are NOT standalone statuses.** External resource requirements are captured via the `requiresExternalResource` flag + `externalResourceNote` + `externalResourceCost` fields and do **not** affect the core status flow.

#### 5.2.3 KPI & SLA Measurement Points

| Metric | Start Event | End Event | Notes |
|---|---|---|---|
| **SLA (Department)** | Ticket moves to `open` | Ticket moves to `resolved` | Configured in hours per department or ticket type |
| **First Response Time** | Ticket moves to `open` | First agent message sent (`firstResponseAt`) | Stamped automatically on first message |
| **Resolution Time (Agent KPI)** | Ticket moves to `open` | Ticket moves to `resolved` (`completedAt`) | Used for agent performance analytics |
| **Requester Satisfaction** | Ticket moves to `resolved` | Requester submits rating | Optional; stored as `rating` + `feedback` on ticket |

#### 5.2.4 Ticket Operations

| ID | Requirement |
|---|---|
| TKT-10 | Agent moves ticket `pending` → `open` to acknowledge it; SLA timer starts at this exact timestamp |
| TKT-11 | Agent moves ticket `open` → `resolved`; `completedAt` is stamped, KPI is locked, and a push notification is sent to the requester |
| TKT-12 | Requester may move ticket `resolved` → `closed` (confirmation + optional rating); voluntary with no time limit |
| TKT-13 | Requester may reopen a `resolved` ticket, returning it to `pending`; a new SLA cycle begins when the target dept moves it to `open` |
| TKT-14 | Agents can assign or reassign tickets to department members while the ticket is `open` |
| TKT-15 | Transfers are governed by `DeptTransferAllowlist`; only permitted source→target pairs are valid; a transfer reason is required |
| TKT-16 | On transfer, the ticket returns to `pending` in the target department; a new SLA cycle starts when that department moves it to `open` |
| TKT-17 | Full status history is maintained per ticket (`TicketStatusHistory`) |
| TKT-18 | `firstResponseAt` is stamped on the first agent message after the ticket reaches `open` |
| TKT-19 | Archived tickets are soft-deleted from active views but remain searchable |
| TKT-20 | External resource requirements are captured via `requiresExternalResource`, `externalResourceCost`, and `externalResourceNote` flags — they do **not** change ticket status |
| TKT-21 | Tickets can be linked to a hospital asset via `assetId` |

### 5.3 Messaging

| ID | Requirement |
|---|---|
| MSG-01 | Each ticket has a threaded message conversation |
| MSG-02 | Message visibility: `public` (visible to requester) or `internal` (agents only) |
| MSG-03 | Messages support text, file attachments, and voice notes |
| MSG-04 | Read/unread status is tracked per message per user |
| MSG-05 | New messages trigger real-time Socket.io events to subscribed clients |
| MSG-06 | New messages trigger browser push notifications (Web Push / VAPID) |

### 5.4 SLA Management

| ID | Requirement |
|---|---|
| SLA-01 | SLA hours are configurable at the department level and per ticket type; ticket-type setting overrides department default |
| SLA-02 | SLA deadline is calculated at ticket creation and stored as `slaDeadline` |
| SLA-03 | A cron job runs every 5 minutes to detect tickets approaching or exceeding their SLA |
| SLA-04 | A warning notification is sent when 80% of SLA time has elapsed (`slaWarningSent` flag set) |
| SLA-05 | A breach notification is sent when the SLA deadline is passed (`slaBreachSent` flag set) |
| SLA-06 | SLA status is visible in both ticket list and ticket detail views |

### 5.5 Notifications

| ID | Requirement |
|---|---|
| NOTIF-01 | In-app notifications are stored per user with read/unread state |
| NOTIF-02 | Browser push notifications delivered via Web Push (VAPID) for key ticket events |
| NOTIF-03 | Notification triggers: new ticket assigned, new message, status change, SLA warning, SLA breach |
| NOTIF-04 | Notification content is bilingual (AR/EN) based on user language preference |
| NOTIF-05 | Users can subscribe or unsubscribe from push notifications at any time |

### 5.6 Analytics Dashboard

| ID | Requirement |
|---|---|
| ANA-01 | Department managers view: ticket volume, resolution rate, SLA compliance, and agent performance |
| ANA-02 | Admins view cross-department analytics |
| ANA-03 | Charts: ticket trends over time, status distribution, priority breakdown, top agents |
| ANA-04 | All analytics support date-range filters |
| ANA-05 | Data is exportable as CSV/Excel; each export is logged in `ExportHistory` |
| ANA-06 | Exported files expire and are automatically cleaned up |

### 5.7 Knowledge Base

| ID | Requirement |
|---|---|
| KB-01 | Articles are organized into categories |
| KB-02 | Content is bilingual: Arabic and English titles and body text |
| KB-03 | Full-text search across all articles |
| KB-04 | View counter tracked per article |
| KB-05 | Users with `canManageKnowledgeBase` can create, edit, and deactivate articles |
| KB-06 | Inactive articles are hidden from end users |

### 5.8 Team Feed

| ID | Requirement |
|---|---|
| FEED-01 | Department-scoped social feed for internal announcements and notes |
| FEED-02 | Posts support text, file attachments, and voice notes |
| FEED-03 | Posts support comments and likes |
| FEED-04 | Posts are soft-deleted (not hard-deleted) |
| FEED-05 | Requires `canManageTeamNotes` permission to post |

### 5.9 Asset Tracking

| ID | Requirement |
|---|---|
| ASSET-01 | Assets are created with: name, serial number, type, location, department, and warranty expiry |
| ASSET-02 | Asset statuses: `active`, `maintenance`, `retired` |
| ASSET-03 | Tickets can be linked to assets for lifecycle tracking |
| ASSET-04 | Asset list is filterable by department, status, and type |

### 5.10 Admin Panel

| ID | Requirement |
|---|---|
| ADM-01 | Manage departments: create, edit, deactivate (soft delete) |
| ADM-02 | Manage department permissions: configure `DeptPermissions` per department |
| ADM-03 | Configure transfer allowlist between departments |
| ADM-04 | Manage users: create, edit, deactivate, assign department and role |
| ADM-05 | Force password reset for any user |
| ADM-06 | Manage ticket types per department with SLA hours and color coding |
| ADM-07 | Manage buildings and floors for location tracking |
| ADM-08 | Manage system settings via a key-value store |

### 5.11 Audit Log

| ID | Requirement |
|---|---|
| AUD-01 | All sensitive actions are recorded: login, ticket CRUD, status changes, transfers, user management, permission changes |
| AUD-02 | Each log entry captures: actor (`userId`), action, entity type, entity ID, old value, new value, IP address, user agent |
| AUD-03 | Audit log is queryable by users with `canViewAuditLogs`, with filters for date, action, user, and department |
| AUD-04 | Audit log is immutable — no deletions or edits are permitted |

### 5.12 User Profile

| ID | Requirement |
|---|---|
| PRF-01 | Users can update their avatar, "about" text, and language preference |
| PRF-02 | Users can change their own password |
| PRF-03 | Avatar images are resized server-side via Sharp |

### 5.13 Search

| ID | Requirement |
|---|---|
| SRC-01 | Global search across tickets by subject, description, and ticket number |
| SRC-02 | Search endpoint is rate-limited to prevent abuse |
| SRC-03 | Results are scoped to the user's permission level |

---

## 6. Non-Functional Requirements

### 6.1 Security

| Requirement | Detail |
|---|---|
| JWT secrets | Must be set as strong environment variables; server refuses to start if missing |
| CORS | Whitelist-only origins; credentials mode enabled |
| Content Security Policy | Enforced via Helmet; no `unsafe-inline` in production |
| Rate limiting | Separate limiters: global (100/15 min), login (5/15 min), analytics, search, and file upload |
| Input validation | All inputs validated via Zod schemas before processing |
| File uploads | MIME type, magic-byte, and file-size validation; served from `/uploads` with access control |
| Password storage | bcrypt with appropriate cost factor |
| Refresh token | HTTP-only cookie; validated server-side on every use |
| Audit | 100% of sensitive actions logged |

### 6.2 Performance

| Requirement | Target |
|---|---|
| API response time (p95) | ≤ 500 ms |
| Database queries | No N+1 patterns; use Prisma `include` and aggregation |
| Pagination | Max page size enforced at 100 records |
| Database indexes | All high-traffic query patterns must be indexed |
| Background jobs | BullMQ + Redis for async tasks (notifications, exports) |
| SLA cron job | Non-blocking; runs every 5 minutes |

### 6.3 Reliability

| Requirement | Detail |
|---|---|
| Error handling | Global Express error handler returning structured JSON error responses |
| Graceful shutdown | Server handles `SIGTERM`; drains in-flight connections before exit |
| DB connection pool | Configured via `DATABASE_URL` query parameters |
| Logging | Asynchronous, structured request logging (Morgan + custom middleware) |

### 6.4 Scalability

| Requirement | Detail |
|---|---|
| Stateless API | JWT-based; horizontally scalable with no server affinity |
| Session storage | Refresh tokens stored in PostgreSQL (not in-memory) |
| Queue | BullMQ backed by Redis for distributed background job processing |
| Containerization | Application containerized with Docker; orchestrated via docker-compose |

### 6.5 Internationalization (i18n)

| Requirement | Detail |
|---|---|
| Languages | Arabic (RTL, default) and English (LTR) |
| Framework | i18next on the backend; react-i18next on the frontend |
| User preference | Language persisted in user profile (`langPref`) |
| Database content | Bilingual fields (`nameAr` / `nameEn`) for departments, ticket types, buildings, floors, KB articles, and notifications |

### 6.6 Accessibility & UX

| Requirement | Detail |
|---|---|
| RTL support | Full Arabic RTL layout across all pages |
| Responsive design | Works on desktop and tablet browsers |
| Error boundaries | React error boundary prevents full-app crash on component failure |
| Loading states | All async operations display appropriate loading feedback |

---

## 7. Data Model Summary

### 7.1 Core Entities (24 Tables)

| Domain | Models |
|---|---|
| **Identity** | User, Role, Permission, UserPermissionOverride |
| **Organization** | Department, DeptPermissions, DeptTransferAllowlist |
| **Facilities** | Building, Floor |
| **Ticketing** | Ticket, TicketType, TicketMessage, MessageAttachment, TicketAttachment, TicketStatusHistory, TicketTransfer |
| **Collaboration** | TeamNote, TeamNoteComment, TeamNoteLike, TeamNoteAttachment |
| **Notifications** | Notification, PushSubscription |
| **Knowledge** | KnowledgeCategory, KnowledgeArticle |
| **Assets** | Asset |
| **System** | AuditLog, SystemSetting, ExportHistory |

### 7.2 Key Relationships

```
User              → Department (many-to-one)
User              → Role (many-to-one)
Department        → DeptPermissions (one-to-one)
Ticket            → Department, User (creator), User (assignee)
Ticket            → TicketType, Building, Floor, Asset
Ticket            → TicketMessages → MessageAttachments
Ticket            → TicketStatusHistory
Ticket            → TicketTransfer → Department (from / to)
TeamNote          → TeamNoteComments, TeamNoteLikes, TeamNoteAttachments
KnowledgeArticle  → KnowledgeCategory
AuditLog          → User, Ticket, Department
```

---

## 8. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js (tsx) | LTS |
| Language | TypeScript | ~5.8.2 |
| Backend Framework | Express | ^4.21.2 |
| ORM | Prisma | ^6.2.1 |
| Database | PostgreSQL 16 | Docker |
| Real-time | Socket.io | ^4.8.3 |
| Background Jobs | BullMQ | ^5.73.0 |
| Cache / Queue | Redis (ioredis) | ^5.10.1 |
| Frontend | React 19 + Vite 6 | ^19 / ^6.2 |
| Styling | TailwindCSS 4 | ^4.1.14 |
| State Management | Zustand | ^5.0.12 |
| Forms & Validation | react-hook-form + Zod | ^7 / ^4 |
| i18n | i18next + react-i18next | ^26 / ^17 |
| Auth | JWT + bcrypt | ^9 / ^6 |
| Charts | Recharts | ^3.8.1 |
| File Processing | Multer + Sharp | ^2 / ^0.34 |
| Push Notifications | web-push (VAPID) | ^3.6.7 |
| Testing | Vitest + Supertest | ^4 / ^7 |
| Containerization | Docker + docker-compose | — |
| CI/CD | GitHub Actions | — |

---

## 9. Constraints & Assumptions

### 9.1 Constraints

- **Internal only**: Exclusively for authenticated hospital staff; no public-facing access.
- **Hospital network**: Deployed on-premises or in a private cloud within the hospital network perimeter.
- **Browser-based**: No native mobile app in v2; push notifications delivered via Web Push PWA.
- **Arabic-first**: UI defaults to Arabic RTL; all user-facing strings must have Arabic translations.
- **PostgreSQL 16**: Data layer is tightly coupled to PostgreSQL; no multi-database support required.

### 9.2 Assumptions

- Each user belongs to exactly one department (except `super_admin`, who has no department).
- Ticket numbers are unique and human-readable (department prefix + sequence, not raw UUIDs).
- SLA deadlines use calendar hours, not business hours (business-hours SLA is a v3 enhancement).
- File uploads are stored on local disk (`/uploads`); cloud storage migration is a v3 concern.
- Email notifications are out of scope for v2 (Web Push only).
- Redis is available in the deployment environment.

---

## 10. Release Roadmap

### Phase 1 — Security Hardening (Weeks 1–2) 🔴

> **Goal:** Resolve all critical and high-severity security issues before any production deployment.

| Task | Effort | Priority |
|---|---|---|
| Remove `.env` from git history; rotate all secrets | 4 h | 🔴 Critical |
| Add CSRF protection middleware | 8 h | 🟠 High |
| Fix ticket number generation race condition (serializable transaction) | 8 h | 🟠 High |
| Add file magic-byte content-type validation | 8 h | 🟠 High |
| Fix rate-limiter logic (test vs. production env) | 2 h | 🟠 High |
| Security audit sign-off | 4 h | 🔴 Critical |

### Phase 2 — Stability & Testing (Weeks 3–4) 🟡

> **Goal:** Achieve ≥ 80% test coverage on core flows; fix performance bottlenecks.

| Task | Effort | Priority |
|---|---|---|
| Integration tests for RBAC permission flows | 16 h | 🟠 High |
| Integration tests for ticket lifecycle | 16 h | 🟠 High |
| Fix N+1 analytics queries (Prisma aggregation) | 8 h | 🟡 Medium |
| Implement permission result caching (Redis) | 12 h | 🟡 Medium |
| Add React error boundaries across all pages | 4 h | 🟠 High |
| Improve frontend loading and error states | 8 h | 🟡 Medium |

### Phase 3 — Production Readiness (Weeks 5–6) 🟢

> **Goal:** Full production deployment with monitoring in place.

| Task | Effort | Priority |
|---|---|---|
| API documentation (Swagger / OpenAPI) | 16 h | 🟡 Medium |
| Deployment runbook | 8 h | 🟡 Medium |
| Load testing (k6 or Artillery) | 8 h | 🟠 High |
| Monitoring & alerting setup | 8 h | 🟠 High |
| E2E tests for critical user journeys | 24 h | 🟡 Medium |
| Frontend bundle optimization | 8 h | 🟢 Low |
| Production deployment | 24 h | 🔴 Critical |

### Phase 4 — Post-Launch Enhancements (Months 2–3) 🔵

| Feature | Description |
|---|---|
| Business-hours SLA | SLA deadlines respect hospital operating hours |
| Email notifications | SMTP integration for ticket events |
| Cloud file storage | S3 / MinIO for attachment storage |
| Advanced analytics | Custom report builder and export scheduling |
| Mobile PWA | Improved mobile layout with offline support |
| SSO / LDAP | Active Directory integration for hospital authentication |

---

## 11. Open Issues & Risks

| ID | Issue | Severity | Owner | Status |
|---|---|---|---|---|
| RISK-01 | `.env` file may be in git history with real credentials | 🔴 Critical | DevOps | ⏳ Pending |
| RISK-02 | Ticket number generation has a race condition (duplicates possible) | 🟠 High | Backend | ⏳ Pending |
| RISK-03 | No CSRF protection — state-changing POST/PUT/DELETE endpoints are vulnerable | 🟠 High | Backend | ⏳ Pending |
| RISK-04 | File uploads validated by MIME header only, not by magic bytes | 🟠 High | Backend | ⏳ Pending |
| RISK-05 | N+1 queries in analytics — may degrade performance under load | 🟡 Medium | Backend | ⏳ Pending |
| RISK-06 | No permission caching — DB hit per request for every RBAC check | 🟡 Medium | Backend | ⏳ Pending |
| RISK-07 | Integration tests skipped (require live PostgreSQL on port 5433) | 🟡 Medium | QA | ⏳ Pending |
| RISK-08 | No API documentation (Swagger) for frontend / QA reference | 🟡 Medium | Backend | ⏳ Pending |
| RISK-09 | File uploads stored on local disk — single point of failure | 🟡 Medium | DevOps | 🔵 Deferred v3 |
| RISK-10 | SLA uses calendar hours, not business hours | 🟢 Low | Product | 🔵 Deferred v3 |

---

*Document generated from codebase analysis of `abc-hospital-help-desk-vII` on May 24, 2026.*  
*For technical architecture details see `PROJECT_MAP.md`. For security review history see `REVIEW_EXECUTIVE_SUMMARY.md`.*
