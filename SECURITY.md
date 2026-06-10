# Security Model & Hardening Report - ABCH Ticketing CRM

This document details the security layers implemented during the audit and hardening of the Ticketing CRM.

## 1. Authentication
- **Dual-Identifier Login**: Supports either a numeric **Finger ID (Badge Number)** or a numeric **Numeric Username**.
- **JWT Standard**: Short-lived Access Tokens (stateful validation) and long-lived Refresh Tokens.
- **Secure Password Hashing**: Utilizes `bcrypt` with a cost factor of 12.
- **Strict Identifier Validation**: All user identifiers are strictly numeric-only (`/^\d+$/`) to prevent SQL injection and identifier spoofing.

## 2. Authorization (RBAC & Isolation)
- **Deny-by-Default**: Administrative and core ticketing actions are restricted to authorized roles.
- **Department Isolation**: Agents/Supervisors can only access tickets belonging to their own department unless they are explicitly assigned or added as collaborators.
- **Permission Overrides**: Fine-grained per-user overrides can bypass department defaults (e.g., granting 'Export Data' permission to a specific Agent).
- **Tenant Protection**: Database queries for tickets and analytics are always scoped by `departmentId` for non-Admin roles.

## 3. Communication Security
- **Helmet Headers**: Strict `Content-Security-Policy`, `X-Frame-Options`, and `X-Content-Type-Options`.
- **Socket Isolation**: Users are joined to department-specific rooms (`dept-{id}`) for real-time notifications, preventing cross-department data leakage.

## 4. Input & API Security
- **Input Sanitization**: `Zod` schemas enforce strict types for all incoming request bodies.
- **Rate Limiting**: Prevents brute-force on `/login`, search spamming on `/tickets/search`, and aggregation flooding on `/analytics`.
- **Soft-Delete (Data Integrity)**: Administrators can only deactivate entities (Active: false). History and references in existing tickets are preserved for audit purposes.

## 5. Audit & Compliance
- **Audit Logs**: Every administrative action (User create/edit, Role update, Status change) is logged with `oldData` and `newData` snapshots.
- **Traceability**: All ticket transfers between departments are tracked in the `TicketTransfer` model with reasons and timestamps.

---
*Maintained by ABCH IT Security Team*
