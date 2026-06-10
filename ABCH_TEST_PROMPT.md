# ABCH Hospital Ticketing CRM — Full System Test Suite Prompt

---

## INSTRUCTIONS FOR AGENT

Read AGENTS.md for operating rules.
Read AUDIT_REPORT.md for full system context.

You are writing and executing a **complete test suite** for the ABCH Hospital Ticketing CRM.
Cover every module, every role, every page, every API endpoint, and every edge case.

Rules for this session:
- Write tests in **Vitest** (backend) and **React Testing Library + Vitest** (frontend)
- Each PHASE is a separate task. Wait for NEXT before moving to the next phase
- Do NOT skip edge cases — they are the most important part
- If a test requires a fixture or mock, create it before the test
- All test files go in `__tests__/` next to the file they test, OR in a dedicated `tests/` folder at root
- After writing each phase, RUN the tests and report: PASS count, FAIL count, and exact error for each FAIL
- Fix any FAILs before saying NEXT is ready

---

## PHASE 1 — TEST INFRASTRUCTURE SETUP

Before writing any tests, do the following:

1. Read `package.json` — check if vitest, @testing-library/react, supertest, msw are already installed
2. If missing, install them: `vitest`, `@vitest/coverage-v8`, `supertest`, `@testing-library/react`,
   `@testing-library/user-event`, `@testing-library/jest-dom`, `msw`
3. Create `vitest.config.ts` at root if it doesn't exist with:
   - environment: 'jsdom' for frontend, 'node' for backend
   - setupFiles pointing to a test-setup file
   - coverage thresholds: statements 80%, branches 75%, functions 80%
4. Create `tests/setup.ts` with:
   - @testing-library/jest-dom matchers
   - Global fetch mock
   - Socket.io mock
5. Create `tests/helpers/` with:
   - `auth-helpers.ts` — functions to generate mock JWT tokens for each role
     (super_admin, supervisor, agent, end_user) with correct payload shape
   - `db-helpers.ts` — Prisma test client with transaction rollback after each test
   - `request-helpers.ts` — supertest app wrapper with auth header injection

Output: confirmation that infra is set up and compiles with zero errors.

---

## PHASE 2 — AUTHENTICATION TESTS

File: `tests/auth/auth.test.ts`

Write tests for ALL of the following:

**Login flow:**
- POST /api/auth/login with valid credentials → 200, returns accessToken + sets cookie
- POST /api/auth/login with wrong password → 401
- POST /api/auth/login with non-existent user → 401
- POST /api/auth/login with inactive user (isActive=false) → 403
- POST /api/auth/login with locked account (failedLoginAttempts >= 5) → 423 with lockUntil
- POST /api/auth/login 5 consecutive failures → account locks, 6th attempt returns lockUntil timestamp
- POST /api/auth/login after lockout expires → succeeds and resets counter

**Token refresh:**
- POST /api/auth/refresh with valid cookie → 200, new accessToken
- POST /api/auth/refresh with expired cookie → 401
- POST /api/auth/refresh with tampered cookie → 401
- POST /api/auth/refresh with no cookie → 401
- POST /api/auth/refresh twice with same token (rotation check) → second call returns 401

**Logout:**
- POST /api/auth/logout → 200, cookie cleared, token invalidated in DB
- POST /api/auth/logout then POST /api/auth/refresh → 401 (token revoked)

**JWT payload:**
- Decoded token contains: id, role, departmentId
- Token expiry is 15 minutes (or configured value)
- Algorithm matches what verify expects (no HS256/RS256 mismatch)

**Rate limiting:**
- 5+ login attempts within window from same IP → 429
- 429 response includes Retry-After header

Run tests. Report results.

---

## PHASE 3 — RBAC & AUTHORIZATION TESTS

File: `tests/rbac/authorization.test.ts`

Test every role against every protected endpoint category.
Use the auth helpers from Phase 1 to generate tokens for each role.

**Admin endpoints (super_admin only):**
For each endpoint below, test with ALL 4 roles:
- GET /api/admin/users
- POST /api/admin/users
- PUT /api/admin/users/:id
- DELETE /api/admin/users/:id
- GET /api/admin/roles
- POST /api/admin/roles
- GET /api/admin/buildings (GET should be accessible to all authenticated)
- POST /api/admin/buildings (POST should be super_admin only)
- POST /api/admin/departments
- POST /api/admin/ticket-types
- GET /api/audit
- GET /api/analytics/recent-activity

Expected: super_admin → 200, others → 403 with code: 'FORBIDDEN'

**Ticket endpoints — department scoping:**
- supervisor can GET /api/tickets/department only for their own department
- supervisor cannot GET tickets from a different department
- agent sees only unassigned + assigned-to-them tickets in department
- end_user GET /api/tickets/my returns only their own tickets
- end_user cannot GET /api/tickets/department
- end_user cannot PUT /api/tickets/:id/status
- end_user cannot PUT /api/tickets/:id/assign

**Ticket ownership:**
- Ticket creator (end_user) can GET /api/tickets/:id for their own ticket
- Ticket creator (end_user) cannot GET /api/tickets/:id for another user's ticket
- Ticket creator CAN POST comment on their own ticket even after assignment

**Permission flags:**
- agent with canViewAllDeptTickets=false cannot see unassigned tickets
- supervisor with canExportData=false gets 403 on export endpoint

Run tests. Report results.

---

## PHASE 4 — TICKET LIFECYCLE TESTS

File: `tests/tickets/ticket-lifecycle.test.ts`

**Creation:**
- POST /api/tickets with all required fields → 201, returns ticketNumber
- POST /api/tickets missing subject → 400 with validation error
- POST /api/tickets missing departmentId → 400
- POST /api/tickets with priority='urgent' → accepted (not rejected by Zod)
- POST /api/tickets with priority='critical' → accepted
- POST /api/tickets with priority='invalid_value' → 400
- POST /api/tickets by end_user → ticket.createdById = user.id
- SLA deadline is set on creation based on priority
- TicketStatusHistory entry created with status='open' on creation

**Status transitions (valid):**
- open → in_progress (by agent/supervisor/super_admin) → 200
- in_progress → resolved (with resolutionCategory + resolutionNotes) → 200
- resolved → closed (by creator via /confirm) → 200
- resolved → open (reopened by super_admin) → 200

**Status transitions (invalid — must return 400):**
- open → closed (direct, skipping resolved) → 400
- open → resolved (skipping in_progress) → 400
- closed → in_progress → 400
- closed → resolved → 400

**Locked ticket rules:**
- POST comment on resolved ticket → 400 (locked)
- POST comment on closed ticket → 400 (locked)
- super_admin CAN modify closed/resolved ticket → 200
- Archive non-resolved/non-closed ticket → 400

**Assignment:**
- PUT /api/tickets/:id/assign with valid agentId → 200, ticket.assignedToId updated
- Assign to agent from different department → 400
- Assign to inactive agent → 400
- AuditLog entry created on assignment

**Transfer:**
- POST /api/tickets/:id/transfer to valid department → 200
- TicketTransfer record created with fromDepartmentId + toDepartmentId
- Original assignee cleared after transfer
- Transfer to same department → 400

**inProgressAt field:**
- Set ONLY on first open→in_progress transition
- NOT updated on subsequent in_progress transitions
- Used correctly in AHT calculation

**Auto-archive:**
- Ticket with closedAt > 30 days ago → gets archived by cron
- Ticket with closedAt < 30 days ago → NOT archived
- updatedAt changes (comment added) do NOT reset archive timer

**TicketStatusHistory:**
- Every status change creates a TicketStatusHistory record
- Record contains: ticketId, fromStatus, toStatus, changedById, changedAt

Run tests. Report results.

---

## PHASE 5 — API CONTRACT TESTS

File: `tests/api/contract.test.ts`

For every frontend API call identified in the audit (Section B), write a contract test
that verifies the backend returns the exact shape the frontend expects.

Cover all 44 endpoints from the audit's Section B table. Key ones:

**Dashboard:**
- GET /api/analytics/dashboard-summary returns:
  stats.{total, pending, resolved, open, overdue, slaBreaches, avgResolutionTimeHours, resolvedInternal, resolvedExternal}
  statusDistribution[{status, count}]
  priorityDistribution[{priority, count}]
  departmentPerformance[{nameAr, nameEn, count}]
  recentActivity[{id, user.{fullNameAr, fullNameEn, avatarUrl}, action, createdAt}]
  agentPerformance[{id, nameEn, nameAr, department, resolvedCount, avgResolutionTimeHours, avgResponseTimeHours, slaAdherenceRate}]
  exportHistory[{id, fileName, dateFrom, dateTo, ticketCount, createdAt, fileUrl, exportedBy.{fullNameAr, fullNameEn}}]
  assetSummary.{total, active, maintenance, retired}

**Inbox:**
- GET /api/tickets/department returns tickets with:
  {id, ticketNumber, subject, status, priority, createdAt, creatorName,
   ticketType.{nameAr, nameEn, color}, assignedTo.{fullNameAr, fullNameEn},
   slaDeadline, dueDate}
  + pagination.{total, page, limit, pages}

**Knowledge Base:**
- GET /api/knowledge/articles returns articles array (not null, not undefined)
- GET /api/knowledge/categories returns categories with _count.articles
- GET /api/knowledge/suggest?q=test returns {id, titleAr, titleEn, snippetAr, snippetEn}

**Ticket Details:**
- GET /api/tickets/:id returns full ticket with ALL nested relations:
  createdBy, assignedTo, department, ticketType, attachments,
  comments.{author}, transfers.{fromDept, toDept, transferredBy},
  statusHistory, linkedTickets, asset, auditLogs

**User Management:**
- GET /api/admin/users returns users with pagination (after Phase 2 pagination fix)

For each contract test:
- Seed minimum required data (department, user, ticket)
- Call the endpoint with correct auth
- Assert exact shape with `expect(response.body).toMatchObject({...})`
- Assert no field is `undefined` where frontend expects it

Run tests. Report results.

---

## PHASE 6 — WHITE SCREEN REGRESSION TESTS

File: `tests/frontend/pages.test.tsx`

These pages were previously blank. Write render tests to prevent regression.

For EACH page below:
1. Mock the API calls it makes (use MSW or vi.mock)
2. Render the component with correct router context + auth context
3. Assert it does NOT crash (no thrown errors)
4. Assert at least one key element is visible
5. Assert loading state appears before data loads
6. Assert error state appears when API returns 500

**Pages to test:**

**InboxPage:**
- Renders ticket list when GET /api/tickets/department returns data
- Renders empty state when tickets array is empty
- Renders error state when API returns 500
- Search input filters tickets
- Status filter changes API call params
- Priority filter changes API call params
- Pagination controls work (page 2 fetches with page=2)
- Clicking a ticket navigates to /tickets/:id

**KnowledgeBasePage:**
- Renders article list when GET /api/knowledge/articles returns data
- Renders category list when GET /api/knowledge/categories returns data
- Renders empty state when no articles
- Search input calls GET /api/knowledge/search
- Create article button visible to super_admin, hidden to end_user
- Article modal opens on click

**DashboardPage:**
- Renders all 8 KPI cards without crashing
- KPI cards show actual numbers (not 'undefinedh')
- Chart components render without throwing
- agentPerformance table renders with mock data
- Empty state handled for exportHistory

**MyTicketsPage:**
- Renders ticket cards
- Empty state when no tickets
- Pagination works

**TicketDetailsPage:**
- Renders with full mock ticket object
- Comment form visible and submittable
- Status change dropdown shows correct options for role
- Attachment list renders without crash
- Transfer modal opens when transfer button clicked
- No crash when optional fields (assignedTo, asset) are null

**AnalyticsPage:**
- Renders without crash
- Charts mount without throwing
- Date range picker changes API params

**TeamFeedPage:**
- Renders notes list
- New note form submittable
- Empty state handled

**AuditLogPage (super_admin only):**
- Renders log entries
- Filter by action type works
- Pagination works

**Admin pages (super_admin only):**
- UserManagementPage: renders user table, create user modal opens
- RoleManagementPage: renders roles, edit modal opens
- BuildingsPage: renders building list, delete shows confirmation
- FloorsPage: renders floor list
- DepartmentsPage: renders department list
- TicketTypesPage: renders type list

Run tests. Report PASS/FAIL per page.

---

## PHASE 7 — REAL-TIME SOCKET TESTS

File: `tests/realtime/socket.test.ts`

**Connection:**
- Connect with valid JWT → authenticated successfully
- Connect with expired JWT → connection refused
- Connect with no token → connection refused
- Connect then token expires mid-session → receives disconnect event

**Room joining:**
- User joins dept-{departmentId} room on connect
- User joins user-{userId} room on connect
- GET /api/tickets/:id → user joins ticket-{id} room

**Event emission (server → client):**
- New ticket created in dept → dept room receives 'new-ticket' event with ticketNumber
- Ticket status changed → ticket room receives 'ticket-status-updated' with newStatus
- Ticket assigned → assignee user room receives 'ticket-assigned' event
- New comment posted → ticket room receives 'new-comment' event
- SLA breach detected → dept room receives 'sla-breach' event with ticketId
- ticket-closed event emitted when ticket moves to closed

**Rate limiting:**
- join-ticket event: more than 5/second from same socket → excess events ignored
- reauthenticate event: more than 1/3sec → throttled

**Client reconnection:**
- Socket disconnect → auto-reconnect on /api/auth/refresh success
- Socket disconnect → NotificationProvider does NOT emit duplicate listeners

Run tests. Report results.

---

## PHASE 8 — SECURITY TESTS

File: `tests/security/security.test.ts`

**Input validation / injection:**
- POST /api/tickets with subject containing `<script>alert(1)</script>` → stored safely, not executed
- POST /api/tickets with subject containing SQL: `'; DROP TABLE tickets; --` → stored as plain text
- GET /api/tickets/search?q=../../etc/passwd → no path traversal, returns empty results
- POST /api/admin/users with extremely long strings (10000 chars) → 400 with validation error

**File upload security:**
- Upload .jpg file with valid MIME and valid magic bytes → 200
- Upload .php file renamed to .jpg (MIME: image/jpeg, content: PHP code) → 422 (magic bytes mismatch)
- Upload file > 10MB → 413
- Upload file with path traversal in filename → sanitized filename stored

**Authorization bypass attempts:**
- end_user tries to PUT /api/tickets/:id/assign → 403
- agent sends request with manually crafted JWT claiming role='super_admin' → 403 (signature invalid)
- Modify departmentId in JWT payload without resigning → 401 (signature mismatch)
- Access /admin/users with supervisor token → 403

**Response security:**
- Error response in production mode does NOT contain stack trace
- Response headers include: X-Frame-Options: DENY, X-Content-Type-Options: nosniff,
  Strict-Transport-Security, Content-Security-Policy
- No endpoint returns passwordHash field in response
- No endpoint returns refreshToken value in response body

**Rate limiting:**
- POST /api/auth/login: 6th attempt within window → 429
- POST /api/tickets: more than 10/min per user → 429
- GET /api/tickets/search: more than 30/15min → 429

Run tests. Report results.

---

## PHASE 9 — ARABIC / BILINGUAL TESTS

File: `tests/i18n/arabic.test.ts`

**Search normalization:**
- Search for "مدرسة" matches ticket with subject "مَدْرَسَة" (tashkeel stripped)
- Search for "احمد" matches ticket with subject "أحمد" (Alef variant normalized)
- Search for "احمد" matches "إحمد" and "آحمد" (all Alef variants → ا)
- Search for "فاطمه" matches "فاطمة" (ta marbuta normalized)
- Empty search string returns all results (no crash)
- Search with only tashkeel characters → treated as empty query

**Frontend bilingual render tests:**
- TicketDetailsPage with lang='ar': 'Unassigned' shows as 'غير معين'
- TicketDetailsPage with lang='ar': 'N/A' shows as 'غير متاح' or Arabic equivalent
- All confirm dialogs show Arabic text when lang='ar'
- Error toast messages show Arabic when lang='ar'

**RTL layout tests:**
- dir="rtl" applied when lang='ar'
- JSON viewer forced LTR inside RTL context
- Ticket number uses font-mono regardless of language

Run tests. Report results.

---

## PHASE 10 — BACKGROUND JOB & CRON TESTS

File: `tests/jobs/cron.test.ts`

**Auto-archive job:**
- Ticket with status='closed', closedAt = 31 days ago → archived by job
- Ticket with status='closed', closedAt = 29 days ago → NOT archived
- Ticket with status='closed', closedAt = 31 days ago BUT commented on yesterday → still archived (uses closedAt, not updatedAt)
- Ticket with status='open' → never archived regardless of age
- After archiving: isArchived=true, archivedAt=now(), socket event 'ticket-archived' emitted

**SLA warning job:**
- Ticket approaching SLA deadline (< 2 hours remaining) → SLA warning email/notification queued
- Ticket already breached → SLA breach event emitted
- Ticket already resolved before deadline → no breach counted

**BullMQ jobs:**
- Failed job retries according to configured retry policy
- Failed job after max retries → logged to error log
- Job does not run twice if another instance is already processing it

Run tests. Report results.

---

## PHASE 11 — DATA INTEGRITY TESTS

File: `tests/integrity/data-integrity.test.ts`

**Soft delete consistency:**
- DELETE /api/admin/buildings/:id → sets deletedAt, NOT hard deleted
- GET /api/admin/buildings after delete → deleted building NOT in results
- Ticket referencing deleted building still shows building name (historical data preserved)

**Cascade behavior:**
- Delete department → users in department get departmentId=null (setNull cascade)
- Delete user → their created tickets get creatorId=null (setNull cascade)
- Delete ticket → all comments, attachments, audit logs, transfers deleted (cascade)
- Delete asset → ticket.assetId set to null (setNull cascade)

**Race conditions:**
- Two agents simultaneously assign same ticket → only one succeeds, other gets 409 or re-fetched state
- Ticket status change while another change in flight → last write wins OR optimistic lock error returned

**Unique constraints:**
- Create two users with same email → 409
- Create two users with same badgeNumber → 409
- Create two departments with same nameEn → 409

**BigInt serialization:**
- Aggregated count fields return as number (not "[object BigInt]" or null)

Run tests. Report results.

---

## PHASE 12 — KNOWLEDGE BASE TESTS

File: `tests/knowledge/knowledge.test.ts`

**CRUD:**
- POST /api/knowledge/articles (authorized) → 201 with article data
- POST /api/knowledge/articles (unauthorized end_user) → 403
- PUT /api/knowledge/articles/:id updates titleAr, titleEn, contentAr, contentEn
- DELETE /api/knowledge/articles/:id → soft delete (deletedAt set)
- GET /api/knowledge/articles after delete → deleted article NOT in results

**Categories:**
- POST /api/knowledge/categories → 201
- DELETE /api/knowledge/categories/:id with articles → 400 (non-empty category)
- DELETE /api/knowledge/categories/:id with no articles → 200

**Search:**
- GET /api/knowledge/search?q=test returns articles matching title or content
- Arabic search with tashkeel → normalized before search
- Empty query → returns all articles (paginated)
- Pagination: page=1&limit=5 returns max 5 results

**KB Suggest (wired to NewTicketPage):**
- GET /api/knowledge/suggest?q=network+issue returns top 3 relevant articles
- Response shape: [{id, titleAr, titleEn, snippetAr, snippetEn}]
- Empty query → returns empty array (not error)

Run tests. Report results.

---

## PHASE 13 — ASSET MANAGEMENT TESTS

File: `tests/assets/assets.test.ts`

**CRUD:**
- POST /api/assets (super_admin) → 201
- POST /api/assets (end_user) → 403
- PUT /api/assets/:id → 200 + AuditLog entry created with action='ASSET_UPDATED'
- DELETE /api/assets/:id → soft delete (deletedAt set, NOT hard deleted)
- GET /api/assets after soft delete → deleted asset NOT in results
- Historical ticket referencing deleted asset → assetId preserved (setNull on ticket, not cascade)

**Pagination:**
- GET /api/assets with 50+ assets → returns paginated response with pagination.{total, page, limit, pages}

**Audit trail:**
- Every PUT /api/assets/:id creates AuditLog record
- AuditLog record contains: actorId, assetId, action='ASSET_UPDATED', diff of changed fields
- AuditLog is NOT created for GET requests

Run tests. Report results.

---

## PHASE 14 — USER MANAGEMENT TESTS

File: `tests/users/user-management.test.ts`

**Profile:**
- GET /api/users/me returns user without passwordHash field
- PUT /api/users/profile updates fullNameAr, fullNameEn, phone
- PUT /api/users/avatar with valid image → updates avatarUrl
- PUT /api/users/avatar with oversized file → 413

**Admin user management (super_admin only):**
- POST /api/admin/users creates user with hashed password
- POST /api/admin/users with duplicate email → 409
- POST /api/admin/users with duplicate badgeNumber → 409
- PUT /api/admin/users/:id/deactivate → isActive=false
- Deactivated user cannot login → 403
- Deactivated user's active sessions → invalidated (existing JWT rejected)
- Reset password → new hash stored, old refresh tokens revoked

**Pagination:**
- GET /api/admin/users with 100+ users → paginated response

Run tests. Report results.

---

## PHASE 15 — TEAM NOTES TESTS

File: `tests/team-notes/team-notes.test.ts`

**Access control:**
- Agent in dept A can GET /api/team-notes (sees dept A notes)
- Agent in dept A cannot see dept B notes
- end_user → 403 on all team-note endpoints
- super_admin can see all departments' notes

**CRUD:**
- POST /api/team-notes → 201, note stored with authorId + departmentId
- POST comment on a note → 201
- POST like on a note → toggles like (like → unlike → like)
- DELETE /api/team-notes/:id by author → 200
- DELETE /api/team-notes/:id by non-author non-admin → 403

**Real-time:**
- New note emits socket event to dept room
- New comment emits socket event to note author

Run tests. Report results.

---

## PHASE 16 — ANALYTICS TESTS

File: `tests/analytics/analytics.test.ts`

**Dashboard summary:**
- AHT calculation uses inProgressAt → completedAt (NOT createdAt → completedAt)
- Ticket resolved before inProgressAt was set → falls back to createdAt → completedAt
- SLA breach count: counts tickets where slaDeadline < resolvedAt (NOT slaBreachSent flag)
- Ticket resolved between cron runs → still counted in breach metric
- supervisor gets ONLY their department's data
- super_admin gets system-wide data

**Agent performance:**
- supervisor sees only agents in their own department
- super_admin sees all agents
- resolvedCount, avgResolutionTimeHours, slaAdherenceRate all calculated correctly

**Period scoping:**
- startDate + endDate params filter results correctly
- No start/end → defaults to last 30 days

Run tests. Report results.

---

## FINAL PHASE — COVERAGE REPORT

After all phases complete:

1. Run: `npx vitest run --coverage`
2. Output the full coverage table: file, statements%, branches%, functions%, lines%
3. Flag any file below 70% coverage
4. For each flagged file, identify what scenario is not covered and write the missing test

Final output format:
```
TOTAL TESTS: X
PASSED: X
FAILED: X (list each with file + test name + error)
COVERAGE: statements X%, branches X%, functions X%, lines X%
FILES BELOW 70%: [list]
```
