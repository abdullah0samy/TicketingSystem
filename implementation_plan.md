# ABCH System — Master Omni-Audit & Production Protocol

## Audit Summary

Full codebase scan complete. The system is in **good architectural shape** from previous sessions, but several issues remain. Below is the full finding-by-finding breakdown and the precise fix plan for all four phases.

---

## 🔴 PHASE 1 FINDINGS — Stability & Request Flood

### ✅ Already Fixed (No Action Needed)
- `App.tsx` L94-120: `isFetching` guard prevents `/api/users/me` re-fire — **CORRECT**
- `NotificationProvider.tsx` L118: Socket only reconnects on `accessToken`, `user.id`, `user.departmentId` changes — **CORRECT**
- `DashboardPage.tsx` L102-117: Single-fire `useEffect` with AbortController — **CORRECT**
- `InboxPage.tsx` L126-140: Debounced (300ms) fetch with AbortController — **CORRECT**
- `app.ts`: `globalLimiter`, `loginLimiter`, `analyticsLimiter`, `searchLimiter`, `uploadLimiter` — all present — **CORRECT**
- `helmet` + `cors` + `morgan` middleware — **CORRECT**

### 🔴 CRITICAL BUG #1: `premium-card` & `input-surface` CSS Classes Missing
**Root Cause:** `index.css` defines `.kpi-card`, `.btn-primary`, `.input-field`, `.glass-surface` — but the **entire frontend** uses `.premium-card` and `.input-surface`, which are **undefined**. This causes broken layout/invisible borders everywhere.

**Fix:** Add `.premium-card` and `.input-surface` to `src/index.css`.

### 🔴 BUG #2: `TicketDetailsPage` — Duplicate Socket per Ticket View
**Root Cause:** `TicketDetailsPage.tsx` L165-204 creates its **own separate `io()` socket** in a second `useEffect`, in addition to the one in `NotificationProvider`. This doubles socket connections and triggers duplicate events/notifications.

**Fix:** Remove the inline socket in `TicketDetailsPage` and replace with a shared socket pattern using a context ref or simply rely on the `NotificationProvider` socket + a pub/sub event emitter.

### 🟡 BUG #3: `InboxPage` — Dual `fetchAgents` Definition
**Root Cause:** `InboxPage.tsx` defines `fetchAgents` **twice** (L67 as an inner async + L86 as a standalone function). The outer one is never cleaned up properly. Minor code quality issue.

**Fix:** Remove the duplicate standalone `fetchAgents` function (L86-98).

### 🟡 BUG #4: Prisma Singleton Missing Production Guard
**Root Cause:** `db.ts` only assigns to `global` when `NODE_ENV !== 'production'` — this is correct but the connection pool is not tuned.

**Fix:** Add explicit Prisma pool config: `datasources: { db: { url: process.env.DATABASE_URL } }` with `connection_limit` via connection string, and add `$on('error')` logging.

### 🟡 BUG #5: `analytics/stats` Route — N+1 Fetch Pattern
**Root Cause:** `analytics.routes.ts` has both a `/dashboard-summary` (consolidated) AND separate `/stats`, `/status-distribution`, `/priority-distribution`, `/department-performance`, `/recent-activity`, `/agent-performance` routes. The `AnalyticsPage.tsx` may be calling individual routes instead of the consolidated endpoint, causing a fan-out of 6 requests.

**Fix:** Audit `AnalyticsPage.tsx` and ensure it uses only `/api/analytics/dashboard-summary`. Deprecate the individual endpoints or add caching headers.

### 🟡 BUG #6: SLA Cron — `getIO()` Dynamic Import in Loop
**Root Cause:** `cron.ts` L68 and L124 use `await import('./socket.ts')` inside a `for` loop. Dynamic imports are cached, but this pattern is fragile and adds unnecessary await overhead per ticket.

**Fix:** Import `getIO` statically at the top of `cron.ts`.

---

## 🔵 PHASE 2 FINDINGS — RBAC & Departmental Silos

### ✅ Already Correct
- `checkTicketPermission()` function correctly checks `UserPermissionOverride` then `DeptPermissions`
- Ticket status lock on `resolved`/`closed` for non-super_admin — **CORRECT**
- Department-scoped ticket listing with `canViewAllDeptTickets` check — **CORRECT**
- Agent validation on assign (must belong to ticket's dept) — **CORRECT**
- Transfer allowlist enforcement (`DeptTransferAllowlist`) — **CORRECT**
- All sensitive mutations wrapped in `$transaction` with AuditLog writes — **CORRECT**

### 🔴 BUG #7: WORKFLOW — `resolved → closed` Direct Transition Without Creator Confirmation
**Root Cause:** `workflow.constants.ts` L11 allows agents to set `resolved → closed` directly via the status buttons. But the intent is that `closed` should require **creator confirmation** (via `/confirm` endpoint). An agent can bypass this.

**Fix:** Remove `'closed'` from `resolved`'s allowed transitions in `ALLOWED_TRANSITIONS`. Only the `/confirm` endpoint (creator-only) should set `resolved → closed`. Super Admins retain the PATCH override to force-close.

### 🔴 BUG #8: Comment Lock Inconsistency — Frontend vs Backend
**Root Cause:** `TicketDetailsPage.tsx` L578: `isLocked = (status === 'resolved' || status === 'closed') && role !== 'super_admin' && role !== 'supervisor'`. Supervisors can still add comments to resolved/closed tickets in the **frontend**, but the **backend** at L826 blocks ALL non-super_admin from commenting on resolved/closed tickets. This inconsistency means supervisors get 403 errors they shouldn't.

**Fix:** Align the backend lock check to also allow `supervisor` role to comment on resolved tickets (not closed). OR tighten the frontend to match the backend (no supervisor exception).  
**Decision:** Backend is the source of truth. Update backend lock check to: `closed` = locked for all except super_admin; `resolved` = agents/supervisors CAN comment (for note-taking before creator confirmation), only creator CAN'T be blocked from the confirm flow.

### 🟡 AUDIT: `/api/users/me` — Missing Response Fields
**Root Cause:** `auth.routes.ts` login response includes `department` but the `setAuth` call in `App.tsx` uses `userData` from `/api/users/me`. If `/api/users/me` does not return `department`, the sidebar/header will show blank department names.

**Action:** Verify `/api/users/me` endpoint in `users.routes.ts` returns full user with `department` include.

---

## 🟡 PHASE 3 FINDINGS — Feature Completion

### 🔴 BUG #9: Knowledge Base — No AI Solution Suggestions (Placeholder)
**Root Cause:** The KB routes have full CRUD and bilingual search (`mode: 'insensitive'` in Prisma). The `KnowledgeBasePage.tsx` needs audit for proper keyword highlighting. No AI suggestion endpoint exists.

**Fix:** 
1. Add keyword highlight utility to `KnowledgeBasePage` (wrap matched terms in `<mark>` tags)
2. Add a `/api/knowledge/suggest` endpoint that returns top 3 articles based on ticket subject/description using full-text search overlap

### 🟡 BUG #10: Assets — No Download Header Fix Needed (Already Fixed)
**Root Cause:** `uploads.routes.ts` uses `res.download(filePath, sanitized)` which sets correct `Content-Disposition` headers and has path traversal protection — **CORRECT**.

### 🔴 BUG #11: Analytics — AHT Metric Is Zero
**Root Cause:** `analytics.routes.ts` L108: `respTime` uses `t.firstResponseAt` but `firstResponseAt` is never set in the system — there is **no code that sets `firstResponseAt`** on the Ticket model when the first comment/response is posted.

**Fix:** In `tickets.routes.ts` comment endpoint, set `firstResponseAt` on the ticket if it's currently null and the sender is an agent/department member.

### 🔴 BUG #12: Archive Pages — Archived Tickets Not Hidden from Inbox
**Root Cause:** `tickets.routes.ts` `/department` endpoint (L249-342) does NOT filter out `isArchived: true` tickets by default. Archived tickets appear in the Inbox.

**Fix:** Add `isArchived: false` to the base `where` clause in the `/department` route (and `/my` route). The `/archive` page route should use `isArchived: true`.

---

## 🟣 PHASE 4 FINDINGS — UI/UX, Dark Mode & Branding

### 🔴 BUG #13: CSS — Missing `.premium-card` and `.input-surface` Classes (Same as Bug #1)
**Root Cause:** Confirmed — `index.css` contains `.kpi-card`, `.glass-surface`, `.input-field`, `.btn-primary` but the **entire app** uses `.premium-card` and `.input-surface`. Every card is unstyled.

### ✅ Dark Mode Flash Prevention — Already Correct
`index.html` L8-18 has an inline script that reads `abc-settings-storage` from localStorage and applies `.dark` to `<html>` **before React loads** — this correctly prevents the white flash.

### ✅ Branding — No "Synrt" References Found
grep for "Synrt" returned zero results. The `translations.ts` uses "ABCH"/"ABC Hospital" throughout. Title tag in `index.html` is "ABCH Ticketing System". **CLEAN.**

### 🔴 BUG #14: `settingsStore` — Theme Not Initialized on HTML Element
**Root Cause:** `App.tsx` L85-92 applies `dark` class in a `useEffect`, which runs **after** React renders, causing a brief flash even with the `index.html` script. Additionally, the `logout` function wipes `abc-settings-storage` — meaning after logout, the dark mode localStorage key is deleted and the theme resets to `light` on next login.

**Fix:** 
1. Change `logout` in `authStore.ts` to NOT clear `abc-settings-storage` (only clear auth-related state).
2. Ensure `App.tsx` theme `useEffect` is a no-op when the class is already set by the pre-React script.

### 🟡 BUG #15: `AnalyticsPage.tsx` Audit Required
Need to check if it makes independent API calls instead of using the consolidated dashboard summary endpoint.

---

## Proposed Changes

### PHASE 1: Stability

#### [MODIFY] [index.css](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/index.css)
Add `.premium-card` and `.input-surface` component classes — this is the **highest priority fix** as it affects the entire UI.

#### [MODIFY] [cron.ts](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/core/cron.ts)
Move `getIO` import from dynamic inside loop to static top-level import.

#### [MODIFY] [db.ts](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/core/db.ts)
Add `$on('error')` handler and connection pool tuning comment.

#### [MODIFY] [TicketDetailsPage.tsx](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/pages/tickets/TicketDetailsPage.tsx)
Remove the second `io()` socket creation. Use the existing notification socket via NotificationProvider and a custom event approach for ticket-room events.

#### [MODIFY] [InboxPage.tsx](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/pages/tickets/InboxPage.tsx)
Remove duplicate `fetchAgents` function definition.

---

### PHASE 2: RBAC & Workflow

#### [MODIFY] [workflow.constants.ts](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/modules/tickets/workflow.constants.ts)
Remove `'closed'` from `resolved`'s allowed transitions.

#### [MODIFY] [tickets.routes.ts](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/modules/tickets/tickets.routes.ts)
1. Update the `resolved → closed` block to only allow super_admin
2. Fix the comment lock: `closed` tickets locked for all except super_admin; `resolved` tickets: agents/supervisors CAN comment
3. Add `isArchived: false` filter to `/department` and `/my` routes
4. Set `firstResponseAt` when first agent comment is posted

---

### PHASE 3: Feature Completion

#### [MODIFY] [tickets.routes.ts](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/modules/tickets/tickets.routes.ts)
Set `firstResponseAt` on first agent reply.

#### [NEW] Knowledge Base suggest endpoint in [knowledge.routes.ts](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/modules/knowledge/knowledge.routes.ts)
Add `GET /api/knowledge/suggest?q=...` returning top 3 articles.

#### [MODIFY] [KnowledgeBasePage.tsx](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/pages/KnowledgeBasePage.tsx)
Add keyword highlight rendering in search results.

---

### PHASE 4: UI/UX & Dark Mode

#### [MODIFY] [index.css](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/index.css)
**Primary fix**: Add `.premium-card`, `.input-surface`.

#### [MODIFY] [authStore.ts](file:///home/abdullah/Desktop/abc-hospital-help-desk-vII/src/store/authStore.ts)
Remove `localStorage.removeItem('abc-settings-storage')` from logout — preserve theme preference across sessions.

---

## Verification Plan

### Automated
- Start dev server and confirm no console errors on login
- Navigate all 13 modules and confirm `.premium-card` styles are visible
- Create a ticket → assign → resolve → confirm closure flow
- Attempt to comment on a `closed` ticket as a non-super-admin (expect 403)
- Attempt `resolved → closed` direct status change as agent (expect 400)
- Confirm `isArchived` tickets don't appear in Inbox

### Manual
- Toggle dark mode → logout → login → confirm theme is preserved
- Confirm no white flash on reload in dark mode
- Confirm AHT appears > 0 after an agent replies to a ticket

---

## Checklist Summary (13 Modules)

| Module | Status |
|--------|--------|
| Auth / Login | ✅ Correct |
| Dashboard | ✅ Correct (uses consolidated endpoint) |
| Inbox (Department Tickets) | 🔴 Missing archived filter, duplicate fetchAgents |
| My Tickets (Outgoing) | 🔴 Missing archived filter |
| Ticket Details | 🔴 Duplicate socket, lock inconsistency |
| New Ticket | ✅ Correct |
| Analytics | 🟡 AHT zero (firstResponseAt never set) |
| Knowledge Base | 🟡 No highlight, no AI suggest |
| Team Feed | 🟡 Needs audit |
| Assets | ✅ Correct |
| Audit Log | ✅ Correct |
| User Management | 🟡 Needs /me endpoint audit |
| Admin (Buildings/Floors/Depts/Types) | ✅ Correct |
