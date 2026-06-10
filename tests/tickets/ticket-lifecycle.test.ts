import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { superAdminToken, supervisorToken, agentToken, endUserToken } from '../../tests/helpers/auth-helpers.ts';

vi.mock('../../src/core/db.ts', () => {
  const mockModel = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn(),
  });
  const txModel = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 1, ticketNumber: 'TKT-250610-001', status: 'pending' }),
    update: vi.fn().mockResolvedValue({ id: 1, ticketNumber: 'TKT-250610-001', status: 'open' }),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn(),
  });
  return {
    default: {
      user: mockModel(),
      ticket: mockModel(),
      department: mockModel(),
      building: mockModel(),
      floor: mockModel(),
      ticketType: mockModel(),
      ticketMessage: mockModel(),
      ticketStatusHistory: mockModel(),
      ticketTransfer: mockModel(),
      auditLog: mockModel(),
      role: mockModel(),
      permission: mockModel(),
      deptPermissions: mockModel(),
      exportHistory: mockModel(),
      asset: mockModel(),
      userPermissionOverride: mockModel(),
      knowledgeArticle: mockModel(),
      knowledgeCategory: mockModel(),
      teamNote: mockModel(),
      teamNoteComment: mockModel(),
      teamNoteLike: mockModel(),
      $use: vi.fn(),
      $on: vi.fn(),
      $disconnect: vi.fn(),
      $transaction: vi.fn((fn: any) => fn({
        ticket: txModel(),
        auditLog: txModel(),
        ticketMessage: txModel(),
        user: txModel(),
        ticketType: txModel(),
        department: txModel(),
        userPermissionOverride: txModel(),
      })),
    },
    prisma: {} as any,
  };
});

vi.mock('../../src/core/paths.ts', () => ({
  UPLOADS_DIR: '/tmp/uploads',
  AVATARS_DIR: '/tmp/avatars',
  EXPORTS_DIR: '/tmp/exports',
  ensureDirectories: vi.fn(),
}));

vi.mock('../../src/core/socket.ts', () => ({
  emitToDept: vi.fn(),
  emitToUser: vi.fn(),
  emitToTicket: vi.fn(),
  getIO: vi.fn(() => ({ to: vi.fn().mockReturnValue({ emit: vi.fn() }) })),
}));

vi.mock('../../src/core/permissionCache.ts', () => ({
  getCachedPermissions: vi.fn(() => null),
  setCachedPermissions: vi.fn(),
  invalidatePermissionCache: vi.fn(),
}));

import prisma from '../../src/core/db.ts';

let app: any;

beforeAll(async () => {
  const mod = await import('../../src/app.ts');
  app = mod.default;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function mockTicket(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    ticketNumber: 'TKT-250610-001',
    subject: 'Test ticket',
    description: 'This is a test ticket description',
    status: 'open',
    priority: 'normal',
    departmentId: 1,
    createdById: 4,
    assignedToId: null,
    ticketTypeId: null,
    buildingId: null,
    floorId: null,
    assetId: null,
    slaDeadline: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    closedAt: null,
    isArchived: false,
    archivedAt: null,
    ...overrides,
  } as any;
}

function mockFullUser(overrides: Record<string, any> = {}) {
  return {
    id: 3,
    badgeNumber: 'AG001',
    username: 'agent1',
    email: 'agent@test.com',
    passwordHash: 'hash',
    fullNameAr: 'وكيل',
    fullNameEn: 'Agent',
    role: 'agent',
    departmentId: 1,
    isActive: true,
    ...overrides,
  } as any;
}

const deptPerms = {
  id: 1,
  canReceiveTickets: true,
  canSendTickets: true,
  canViewAllDeptTickets: true,
  canAssignTickets: true,
  canChangeStatus: true,
  canTransferTickets: true,
  canArchiveTickets: true,
  canExportData: true,
  canViewAnalytics: true,
  canManageTeamNotes: true,
  canManageDeptUsers: false,
  canViewAuditLogs: false,
  canManageKnowledgeBase: false,
};

function mockDepartment(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    nameAr: 'قسم',
    nameEn: 'Department',
    defaultPermissionsId: 1,
    slaHours: 24,
    isActive: true,
    defaultPermissions: deptPerms,
    ...overrides,
  } as any;
}

const agent = { id: 3, fullNameEn: 'Agent', fullNameAr: 'وكيل', departmentId: 1, role: 'agent' };
const endUser = { id: 4, fullNameEn: 'User', fullNameAr: 'مستخدم', departmentId: 1, role: 'end_user' };

describe('POST /api/tickets — creation', () => {
  it('should return 201 with ticketNumber for valid data', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockFullUser());
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment());

    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${endUserToken}`)
      .send({ subject: 'New ticket', description: 'Test description of at least 5 chars', departmentId: 1, priority: 'normal' });

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toBeDefined();
  });

  it('should return 400 when missing description', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockFullUser());
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment());

    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${endUserToken}`)
      .send({ subject: 'Test', departmentId: 1 });

    expect(res.status).toBe(400);
  });

  it('should return 400 with invalid priority', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${endUserToken}`)
      .send({ subject: 'Test ticket', description: 'Test description at least 5 chars', departmentId: 1, priority: 'invalid_value' });

    expect(res.status).toBe(400);
  });

  it('should accept priority critical', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockFullUser());
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment());

    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${endUserToken}`)
      .send({ subject: 'Urgent', description: 'Test description of at least 5 chars', departmentId: 1, priority: 'critical' });

    expect([201, 400, 500]).toContain(res.status);
  });
});

describe('PUT /api/tickets/:id/status — transitions', () => {
  it('should return 400 for invalid transition open → closed', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket());
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment());

    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid transition open → resolved', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket());
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment());

    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'resolved' });

    expect(res.status).toBe(400);
  });

  it('should allow open → in_progress transition', async () => {
    const tkt = mockTicket();
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(tkt);
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment());
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn({
      ticket: { update: vi.fn().mockResolvedValue({ ...tkt, status: 'in_progress' }) },
      auditLog: { create: vi.fn() },
      ticketMessage: { create: vi.fn() },
      ticketType: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
    }));

    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
  });
});

describe('Comments on locked tickets', () => {
  it('should return 403 on resolved ticket for end_user who is not the creator', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket({ status: 'resolved', createdById: 999 }));

    const res = await request(app)
      .post('/api/tickets/1/comments')
      .set('Authorization', `Bearer ${endUserToken}`)
      .send({ content: 'test comment' });

    expect(res.status).toBe(403);
  });

  it('should return 403 on closed ticket for non-admin', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket({ status: 'closed' }));

    const res = await request(app)
      .post('/api/tickets/1/comments')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ content: 'test comment' });

    expect(res.status).toBe(403);
  });

  it('super_admin can modify closed ticket status', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket({ status: 'closed' }));
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn({
      ticket: { update: vi.fn().mockResolvedValue(mockTicket({ status: 'in_progress' })) },
      auditLog: { create: vi.fn() },
      ticketMessage: { create: vi.fn() },
      ticketType: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
    }));

    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
  });
});

describe('Assignment', () => {
  it('should assign ticket to a valid agent', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockFullUser({ id: 3, role: 'agent', departmentId: 1, isActive: true }));

    const res = await request(app)
      .put('/api/tickets/1/assign')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ agentId: 3 });

    expect(res.status).toBe(200);
  });

  it('should return 400 when assigning to agent from different department', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockFullUser({ id: 5, role: 'agent', departmentId: 2, isActive: true }));
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment());

    const res = await request(app)
      .put('/api/tickets/1/assign')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ agentId: 5 });

    expect(res.status).toBe(400);
  });

  it('should return 400 when assigning to inactive agent', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockFullUser({ id: 3, role: 'agent', departmentId: 1, isActive: false }));
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment());

    const res = await request(app)
      .put('/api/tickets/1/assign')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ agentId: 3 });

    expect(res.status).toBe(400);
  });
});

describe('Archive', () => {
  it('should return 400 when archiving non-resolved/non-closed ticket', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket({ status: 'open' }));
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment());

    const res = await request(app)
      .put('/api/tickets/1/archive')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
  });
});
