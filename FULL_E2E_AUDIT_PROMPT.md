# ABCH Hospital Ticketing CRM — Full E2E Role-Based Audit (Post-NestJS)

---

## CONTEXT

Read AGENTS.md for operating rules.
Read PRD.md for full system requirements.

This audit is on the CURRENT NestJS codebase (src/), NOT the old Express version.
Older reports (SECURITY.md, PRODUCTION.md, etc.) reference src/ as Express —
IGNORE their file paths. Re-verify everything against the current NestJS structure.

You will simulate a real user clicking through the system for EACH of the 4 roles:
super_admin, supervisor, agent, end_user.

For each role, you act as that user would: log in, see what menu items/tabs appear,
try to open each page, try each action button, and verify what happens.

---

## RULES

RULE 1 — ONE ROLE AT A TIME
Complete the full audit for one role before moving to the next. Wait for NEXT.

RULE 2 — SIMULATE, DON'T ASSUME
For frontend checks: read the actual route guards, sidebar/nav component,
and page components — determine what renders for this role by reading the code,
not by inferring from naming.

For backend checks: for every action the role takes, find the actual controller
method and middleware/guards applied — trace the real authorization chain.

RULE 3 — OUTPUT FORMAT
For each role, produce TWO tables:

### TABLE A — UI VISIBILITY (what this role sees)
| Sidebar Item / Tab | Visible? | File (guard logic) | Notes |
|---------------------|----------|---------------------|-------|

### TABLE B — ACTION JOURNEY (what this role can DO)
| Journey Step | Frontend Allows? | Backend Allows? | Match? | File(s) |
|--------------|-------------------|-------------------|--------|---------|

RULE 4 — FLAG MISMATCHES IMMEDIATELY
Any row where Frontend ≠ Backend is a security issue. Mark with 🚨 and
add to a running ISSUES list. Do not fix yet — catalog first.

RULE 5 — DEPARTMENT BOUNDARY TESTS
For supervisor/agent, explicitly test: can this user see/touch data belonging
to ANOTHER department? Trace the actual Prisma `where` clause used.

---

## PHASE 1 — SUPER_ADMIN JOURNEY

Simulate logging in as super_admin. Walk through:

**Navigation / Sidebar:**
- List every sidebar item / tab that should be visible
- For each, find the route guard (frontend) — confirm super_admin passes

**Dashboard:**
- GET /api/analytics/dashboard-summary — confirm super_admin sees system-wide data
  (not scoped to one department)
- All KPI cards render with real numbers

**Inbox / Department Tickets:**
- GET /api/tickets/department — can super_admin view tickets from ALL departments,
  or only one? Trace the Prisma where clause for super_admin role
- Can filter by department (dropdown should show all departments)

**Ticket Actions:**
- Create ticket → any department
- Assign ticket → to any agent in any department
- Change status → full lifecycle including direct override of locked tickets
- Transfer ticket → between any two departments, bypassing DeptTransferAllowlist?
  (verify: does super_admin bypass the allowlist, per PRD)
- Archive ticket → any ticket regardless of department
- Reopen closed ticket → only super_admin can do this (per audit) — verify backend
  actually enforces this

**Admin Pages (super_admin exclusive):**
- User Management: list, create, edit, deactivate users — verify each backend
  endpoint requires super_admin role
- Role Management: edit DeptPermissions and UserPermissionOverride
- Buildings / Floors / Departments / Ticket Types: full CRUD
- Audit Log: GET /api/audit — can see logs from ALL departments/users

**Knowledge Base:**
- Create / edit / delete articles and categories — verify backend permission

**Assets:**
- Full CRUD on assets, including soft-delete (deletedAt)
- AuditLog entry created on every PUT

**Analytics:**
- Agent performance — sees ALL agents across ALL departments
- Export — canExportData should be implicitly true for super_admin; verify

**Team Notes:**
- Can view/post in ANY department's team notes feed

Produce TABLE A and TABLE B for super_admin. Then wait for NEXT.

---

## PHASE 2 — SUPERVISOR JOURNEY

Simulate logging in as a supervisor of Department X (pick a real seeded department).

**Navigation / Sidebar:**
- Same as Phase 1 — list visible items, confirm guard logic
- Confirm Admin pages (User Mgmt, Role Mgmt, Buildings, etc.) are HIDDEN

**Dashboard:**
- GET /api/analytics/dashboard-summary — confirm data is scoped to Department X ONLY
- Try to access another department's dashboard data (manipulate query params if
  the endpoint accepts a departmentId param) — should be rejected or ignored

**Inbox / Department Tickets:**
- GET /api/tickets/department — returns ONLY Department X tickets
- 🚨 CRITICAL TEST: attempt GET /api/tickets/department with a manipulated
  departmentId for Department Y — confirm backend ignores/rejects it
- 🚨 CRITICAL TEST: attempt GET /api/tickets/:id for a ticket belonging to
  Department Y — confirm 403/404

**Ticket Actions (within own department):**
- Create ticket → defaults to own department
- Assign ticket → only to agents within Department X
  - 🚨 attempt to assign to an agent in Department Y — confirm backend rejects
- Change status → full lifecycle EXCEPT cannot bypass resolved/closed lock
  (only super_admin can)
- Transfer ticket → to departments in DeptTransferAllowlist for Department X only
  - 🚨 attempt transfer to a department NOT in the allowlist — confirm 403
- Archive ticket → only resolved/closed tickets in own department
- Reopen closed ticket → 🚨 confirm supervisor CANNOT do this (super_admin only)

**Team Notes:**
- Can post/view Department X notes only
- 🚨 attempt to GET another department's team notes — confirm 403

**Analytics:**
- Agent performance — sees ONLY agents in Department X
  - 🚨 attempt to query agent-performance for Department Y — confirm rejected/empty
- Export — check canExportData permission for this supervisor (DeptPermissions
  default for supervisor role, or UserPermissionOverride if set)

**Knowledge Base:**
- Can supervisor create/edit articles? Check canManageKnowledgeBase permission
- Can view all articles regardless of department (KB is usually global — verify)

**Assets:**
- Can supervisor view/edit assets? What's the permission boundary —
  department-scoped or global?

**Permission Overrides:**
- If Department X has a UserPermissionOverride granting this supervisor an
  EXTRA permission (e.g. canExportData=true when DeptPermissions default is false),
  verify it actually takes effect
- If an override REVOKES a default permission, verify it's enforced too

Produce TABLE A and TABLE B for supervisor. Then wait for NEXT.

---

## PHASE 3 — AGENT JOURNEY

Simulate logging in as an agent in Department X.

**Navigation / Sidebar:**
- List visible items — confirm Analytics/Admin/Audit hidden (unless permission
  override grants access)

**Dashboard:**
- Does agent have dashboard access at all? If yes, scoped to what data?

**Inbox / Department Tickets:**
- GET /api/tickets/department — what does this return for an agent?
  - If `canViewAllDeptTickets=true` (DeptPermissions or override): sees all
    Department X tickets (assigned + unassigned)
  - If `canViewAllDeptTickets=false`: sees ONLY tickets assigned to them +
    unassigned tickets (verify exact Prisma where clause)
- 🚨 Test both permission states — find/create test users with each setting

**My Tickets:**
- GET /api/tickets/my — only tickets where agent is creator (if agent can create
  tickets) — or is this end_user only? Clarify from schema/PRD

**Ticket Actions:**
- View ticket details — only for tickets they can see per above rule
  - 🚨 attempt GET /api/tickets/:id for a ticket NOT assigned to them and
    NOT unassigned (assigned to another agent) — confirm 403 if
    canViewAllDeptTickets=false
- Take/assign ticket to self — verify endpoint and permission
- Change status — open→in_progress→resolved (with resolutionCategory +
  resolutionNotes required)
- 🚨 attempt resolved→closed directly — confirm 400 (must use /confirm,
  creator-only)
- Post comment — confirm locked on resolved/closed tickets (per BUG #8:
  agents CAN comment on resolved but not closed)
- Transfer ticket — can agent transfer, or supervisor/super_admin only?
  Check actual RBAC guard
- Archive — likely supervisor/super_admin only; confirm agent is blocked

**Team Notes:**
- Post/view Department X notes
- Like/comment on notes
- 🚨 delete another agent's note — confirm 403 (only author or admin)

**Knowledge Base:**
- View articles (read-only expected)
- 🚨 attempt POST /api/knowledge/articles — confirm 403 unless permission granted

**Assets:**
- 🚨 attempt any asset CRUD — confirm 403 (super_admin/supervisor only, per
  earlier audit)

**Analytics:**
- 🚨 attempt GET /api/analytics/dashboard-summary or agent-performance —
  confirm 403 unless canViewAnalytics override exists

Produce TABLE A and TABLE B for agent. Then wait for NEXT.

---

## PHASE 4 — END_USER JOURNEY

Simulate logging in as an end_user (hospital staff submitting tickets,
NOT IT department).

**Navigation / Sidebar:**
- List visible items — expect: New Ticket, My Tickets, Knowledge Base, Profile
- Confirm Inbox, Analytics, Team Notes, Admin, Audit ALL hidden

**New Ticket:**
- POST /api/tickets — required fields, defaults (creatorId = self)
- Can end_user select ANY department for the ticket, or is there routing logic
  (per audit's "no building-floor validation" finding — check if fixed)
- 🚨 Server-side validation: does it verify building/floor combination is real?
- KB suggestions — does typing in subject/description trigger
  GET /api/knowledge/suggest? (verify wired, per earlier "NOT WIRED" finding)

**My Tickets:**
- GET /api/tickets/my — returns ONLY tickets created by this user
- 🚨 attempt GET /api/tickets/my with another user's ID injected somehow
  (e.g. query param) — confirm ignored, always uses authenticated user's ID

**Ticket Details:**
- GET /api/tickets/:id for own ticket — 200, full details visible
- 🚨 GET /api/tickets/:id for someone else's ticket — confirm 403/404
- Post comment on own ticket — allowed while open/in_progress
- 🚨 Post comment on own ticket while status='resolved' — confirm BLOCKED
  for end_user (per BUG #8: only non-creator end_users blocked on resolved —
  RE-VERIFY: is the CREATOR also blocked, or allowed since it's their ticket?)
- 🚨 Post comment while status='closed' — confirm BLOCKED even for creator

**Confirm/Close flow:**
- PUT /api/tickets/:id/confirm — only when status='resolved' AND
  requester is the ticket creator
- 🚨 attempt /confirm on someone else's resolved ticket — confirm 403
- 🚨 attempt /confirm on a ticket that's still 'open' or 'in_progress' —
  confirm 400

**Reopen:**
- 🚨 can end_user reopen a closed ticket? Per audit, only super_admin can —
  confirm end_user gets 403

**Knowledge Base:**
- Can browse/search articles (read-only)
- 🚨 attempt any write operation — confirm 403

**Assets, Analytics, Team Notes, Admin, Audit:**
- 🚨 attempt direct API access to each — confirm 403 for ALL

**Profile:**
- GET /api/users/me — verify response does NOT include passwordHash
- PUT /api/users/profile — can update own name/phone
- 🚨 attempt to PUT another user's profile via manipulated :id — confirm 403

Produce TABLE A and TABLE B for end_user. Then wait for NEXT.

---

## PHASE 5 — DEPARTMENT ROUTING & TRANSFER FLOW (CROSS-ROLE)

This phase tests the full lifecycle of a ticket moving between departments.

**Scenario:** end_user in Department A submits a ticket. It needs to go to
Department B (per DeptTransferAllowlist, A→B should be allowed; A→C should
NOT be allowed).

1. end_user creates ticket — verify it lands in Department A's inbox
2. supervisor/agent in Department A sees it in Inbox (TABLE B already covered
   visibility — here verify the REAL DATA)
3. Department A agent/supervisor transfers ticket to Department B
   - Verify TicketTransfer record created (fromDepartmentId, toDepartmentId,
     transferredById, reason)
   - Verify original assignee cleared
   - Verify Department B's Inbox now shows this ticket
   - Verify Department A's Inbox no longer shows it (or shows it as
     "transferred out" — check actual UI/query)
4. 🚨 Department A tries to transfer to Department C (NOT in allowlist) —
   confirm 403/400
5. Department B resolves and the creator (end_user, Department A) confirms close
   - 🚨 verify end_user CAN still see/confirm a ticket that's now "owned" by
     Department B — creator access should persist across transfers

**Socket events during this flow:**
- 'new-ticket' → Department A room (on creation)
- 'ticket-transferred' or similar → Department A room (ticket leaving) AND
  Department B room (ticket arriving) — verify both events exist
  (per audit finding: "Transfer doesn't notify original department" — RE-VERIFY
  if this was fixed)

Produce a single narrative table:
| Step | Expected | Actual (from code) | Match |

Then wait for NEXT.

---

## PHASE 6 — KNOWLEDGE BASE & ARABIC SEARCH (CROSS-ROLE)

**Bilingual content:**
- Articles have titleAr/titleEn, contentAr/contentEn — verify both populated
  in seed data and returned correctly based on user's language preference

**Search normalization (re-verify per earlier audit finding):**
- Search "مدرسة" matches "مَدْرَسَة" (tashkeel stripped) — find the actual
  normalization code, confirm it's applied to knowledge search AND ticket search
- Search "احمد"/"أحمد"/"إحمد"/"آحمد" — all normalize to same result

**KB Suggest on ticket creation:**
- Confirm GET /api/knowledge/suggest is called from the New Ticket form
  (per earlier "NOT WIRED" finding — find the frontend code that calls it)
- If still not wired, flag as 🚨 OPEN ISSUE

Produce a table. Then wait for NEXT.

---

## PHASE 7 — CONSOLIDATED ISSUES REPORT

After all phases, produce:

### 🚨 CRITICAL ISSUES (security/RBAC mismatches)
| # | Role | Issue | Frontend Behavior | Backend Behavior | File(s) |

### ⚠️ FUNCTIONAL GAPS (features described in older docs, not yet verified/fixed)
| # | Feature | Status | Source Doc | File(s) |

### ✅ CONFIRMED WORKING (spot-check highlights)
| # | Feature | Verified By |

### PRIORITY FIX ORDER
Sort all 🚨 and ⚠️ items by: data leakage risk > permission bypass >
functional bug > UX issue.

| Priority | Issue | Fix Effort (S/M/L) |

Do NOT fix anything yet. This is the final audit report.
Wait for my review before any fixes begin.

---

## START

Begin with PHASE 1 (super_admin). Read the actual current codebase —
do not rely on the older markdown reports for file paths or claims;
verify everything fresh against src/ (NestJS).
