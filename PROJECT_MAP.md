# ABC Hospital Help Desk vII — Project Map

## [TECH_STACK]
| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js (via tsx) | — |
| Language | TypeScript | ~5.8.2 |
| Backend Framework | Express | ^4.21.2 |
| ORM | Prisma | ^6.2.1 |
| Database | PostgreSQL 16 (via Docker) | — |
| Real-time | Socket.io | ^4.8.3 |
| Background Jobs | BullMQ (Redis) | ^5.73.0 |
| Cache/Queue | Redis (ioredis) | ^5.10.1 |
| Frontend | React 19 + Vite 6 | ^19.0.0 / ^6.2.0 |
| Styling | TailwindCSS 4 | ^4.1.14 |
| State | Zustand | ^5.0.12 |
| Forms | react-hook-form + zod | ^7.72.1 / ^4.3.6 |
| i18n | i18next + react-i18next | ^26.0.3 / ^17.0.2 |
| Auth | JWT (jsonwebtoken + bcrypt) | ^9.0.3 / ^6.0.0 |
| Charts | Recharts | ^3.8.1 |
| File Upload | Multer + Sharp | ^2.1.1 / ^0.34.5 |
| Testing | Vitest + Supertest | ^4.1.4 / ^7.2.2 |
| Push Notifications | web-push | ^3.6.7 |

## [SYSTEM_FLOW]

```
[Client Browser]
     │
     ├── React SPA (Vite) ─────────────────────────────┐
     │   ├── Pages: Login, Dashboard, Tickets,          │
     │   │   Analytics, Admin, Audit, KB, Team Feed,    │
     │   │   User Profile                               │
     │   ├── Stores: authStore, settingsStore           │
     │   └── Components: ErrorBoundary, GlobalSearch    │
     │                                                 │
     └── Socket.io Client ◄─────────────────────────┐  │
                                                     ▼  │
[Express Server (port 3000)]                           │
     │                                                  │
     ├── Middleware: Helmet, CORS, Morgan, CookieParser │
     ├── Rate Limiters: Global, Login, Analytics,       │
     │   Search, Upload                                 │
     ├── Auth: JWT access/refresh tokens, bcrypt        │
     ├── API Modules:                                   │
     │   ├── /api/auth        ── Login/Register/Refresh │
     │   ├── /api/users       ── User CRUD              │
     │   ├── /api/admin       ── Dept/User management   │
     │   ├── /api/tickets     ── Full ticket lifecycle  │
     │   ├── /api/analytics   ── Dashboard stats        │
     │   ├── /api/uploads     ── File uploads           │
     │   ├── /api/assets      ── Asset tracking          │
     │   ├── /api/knowledge   ── Knowledge base CRUD     │
     │   ├── /api/team-notes  ── Team notes              │
     │   └── /api/audit       ── Audit log queries       │
     │                                                  │
     ├── Prisma ORM ── PostgreSQL (Docker, port 5433)   │
     ├── BullMQ ──── Redis ──── Background jobs        │
     ├── Socket.io ── Real-time ticket/message events   │
     └── Cron Jobs ── SLA breach detection, reminders   │
```

## [ARCHITECTURE]

### Backend (`src/`)
```
src/
├── app.ts                  # Express bootstrap (middleware, routes, error handling)
├── core/                   # Shared infrastructure
│   ├── db.ts               # Prisma singleton + error middleware
│   ├── socket.ts           # Socket.io init & event handlers
│   ├── cron.ts             # Scheduled jobs (SLA, reminders)
│   ├── api.ts              # Axios instance for external calls
│   ├── middleware/
│   │   ├── auth.middleware.ts   # JWT verification
│   │   ├── upload.middleware.ts # Multer config
│   │   └── request_logger.ts    # API request logging
│   ├── utils/api.utils.ts       # Response helpers
│   ├── translations.ts     # i18next server-side config
│   └── NotificationProvider.tsx # Push notification React context
├── modules/                # Domain-driven modules
│   ├── auth/               # JWT login, refresh, logout
│   ├── users/              # User CRUD
│   ├── admin/              # Department & user management
│   ├── tickets/            # Ticket CRUD, workflow, SLA, validation
│   ├── analytics/          # Statistics & reporting
│   ├── uploads/            # File handling
│   ├── assets/             # Asset lifecycle
│   ├── knowledge/          # Knowledge base articles
│   ├── team-notes/         # Internal team notes
│   └── audit/              # Audit trail
├── pages/                  # React pages (SPA views)
├── components/             # Shared UI components
├── store/                  # Zustand state management
└── lib/utils.ts            # Frontend utilities
```

### Database (Prisma Schema — 20 models)
- **Core**: User, Department, Role, Permission
- **Ticketing**: Ticket, TicketType, TicketMessage, TicketAttachment, TicketStatusHistory, TicketTransfer
- **Permissions**: DeptPermissions, UserPermissionOverride, DeptTransferAllowlist
- **Facilities**: Building, Floor
- **Collaboration**: TeamNote, TeamNoteComment, TeamNoteLike, TeamNoteAttachment
- **Notifications**: Notification, PushSubscription
- **Monitoring**: AuditLog
- **Assets**: Asset (with ticket association)
- **Knowledge**: KnowledgeCategory, KnowledgeArticle
- **System**: SystemSetting, ExportHistory

## [ORPHANS & PENDING]
| Item | Status | Notes |
|------|--------|-------|
| All API modules wired in `app.ts` | ✅ | 10 modules, all routes functional |
| Prisma schema | ✅ | 20 models, full domain coverage |
| TypeScript lint (`tsc --noEmit`) | ✅ | Clean, zero errors |
| Unit tests (73 tests, 6 files) | ✅ | All pass |
| Integration tests (6 tests) | 🟡 | Skipped — requires PostgreSQL on 127.0.0.1:5433 (environment not available in this session) |
| Production build (`vite build`) | ✅ | Succeeds, all chunks generated |
| Docker compose | ✅ | `docker-compose.yml` with app + postgres + redis |
| Dockerfile | ✅ | Multi-stage build (frontend builder + production) |
| CI/CD pipeline | ✅ | `.github/workflows/ci.yml` — runs lint, unit + integration tests, build on push/PR |
| Production .env hardening | ✅ | VAPID keys generated, all env vars documented in `.env.example` |
| Redis for production | ✅ | Added `redis:7-alpine` service to `docker-compose.yml` |
| Push notifications (VAPID) | ✅ | Real VAPID keys generated and set in `.env.example` |
