# Production Operations Guide - ABCH Ticketing CRM

This document outlines the operational requirements, security configurations, and maintenance procedures for the ABCH Ticketing CRM in a production environment.

## 1. Environment Variables

Ensure the following variables are set in your production environment:

| Variable | Description | Recommendation |
|----------|-------------|----------------|
| `DATABASE_URL` | PostgreSQL connection string | Use a managed DB (RDS/Cloud SQL) |
| `JWT_SECRET` | Secret key for Access Tokens | 64+ char random string |
| `REFRESH_TOKEN_SECRET` | Secret key for Refresh Tokens | Separate 64+ char random string |
| `NODE_ENV` | Environment mode | Must be set to `production` |
| `PORT` | Listening port | Default is `3000` |

## 2. Security Architecture

### Role-Based Access Control (RBAC)
The system uses a multi-tier RBAC system:
- **`super_admin`**: Full system access, bypasses all department restrictions.
- **`supervisor`**: Access to their department's tickets, analytics, and team notes.
- **`agent`**: Access to their department's tickets (assigned or department-wide) and basic analytics.
- **`end_user`**: Can only view and interact with tickets they created.

### API Protection
- **Rate Limiting**: Multi-tiered limits applied per IP (Global, Login, Analytics, Search, Uploads).
- **Security Headers**: Powered by `helmet`. CSP is configured to allow self-hosted assets and specific external domains.
- **Input Validation**: All core endpoints use `Zod` schemas for strict type and format validation.

## 3. Maintenance Procedures

### Daily Cleanup (3:00 AM)
A scheduled cron job automatically:
1. Deletes expired physical export files from `uploads/exports/`.
2. Clears expired `ExportHistory` records from the database.

### Auto-Archiving (4:00 AM)
Tickets in `resolved` or `closed` status for more than 30 days are automatically moved to the Archive.

### SLA Monitoring (Every 5 Minutes)
Checks for tickets approaching or breaching their SLA deadlines. Triggered alerts are sent via Socket.io and persistent notifications.

## 4. Troubleshooting & Logging

- **Request Logs**: Found in stdout (morgan format).
- **Audit Logs**: Stored in the `AuditLog` table for all administrative and ticket status changes.
- **Global Error Handling**: Stack traces are hidden in production; users receive a generic `requestId` for IT support follow-up.

---
*For critical system failures, refer to the Database Recovery Walkthrough in the artifacts directory.*
