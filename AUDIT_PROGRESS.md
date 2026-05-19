# ABCH Ticketing System — 360° Audit Tracker

**Commit Base:** `e7a49c6` → **Current Head:** `e21733b`
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
**Status:** ⚪ NOT STARTED
**Files:**
**Findings:**
**Remediation:**

### 1.3 Scale & Performance (20-Year Horizon)
**Status:** ⚪ NOT STARTED
**Files:**
**Findings:**
**Remediation:**

### 1.4 Load Testing
**Status:** ⚪ NOT STARTED
**Files:**
**Findings:**
**Remediation:**

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
