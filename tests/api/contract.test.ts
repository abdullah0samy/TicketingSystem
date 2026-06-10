import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { superAdminToken, endUserToken } from '../../tests/helpers/auth-helpers.ts';

vi.mock('../../src/core/db.ts', () => {
  const m = () => ({
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
  const tx = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({ id: 1 }),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn(),
  });
  return {
    default: {
      user: m(),
      ticket: m(),
      department: m(),
      building: m(),
      floor: m(),
      ticketType: m(),
      ticketMessage: m(),
      ticketStatusHistory: m(),
      ticketTransfer: m(),
      auditLog: m(),
      role: m(),
      permission: m(),
      deptPermissions: m(),
      exportHistory: m(),
      asset: m(),
      userPermissionOverride: m(),
      knowledgeArticle: m(),
      knowledgeCategory: m(),
      teamNote: m(),
      teamNoteComment: m(),
      teamNoteLike: m(),
      $use: vi.fn(),
      $on: vi.fn(),
      $disconnect: vi.fn(),
      $transaction: vi.fn((fn: any) => fn({
        ticket: tx(), auditLog: tx(), ticketMessage: tx(), user: tx(),
        ticketType: tx(), department: tx(), userPermissionOverride: tx(),
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

describe('GET /api/tickets/department — inbox contract', () => {
  it('should return tickets array with pagination shape', async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValue([{
      id: 1, ticketNumber: 'TKT-001', subject: 'Test', status: 'open', priority: 'normal',
      createdAt: new Date(), creatorName: 'User', slaDeadline: new Date(),
      ticketType: { nameAr: 'نوع', nameEn: 'Type', color: '#000' },
      assignedTo: { fullNameAr: 'وكيل', fullNameEn: 'Agent' },
      departmentId: 1,
    } as any]);
    vi.mocked(prisma.ticket.count).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/tickets/department')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .query({ page: 1, limit: 20 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tickets)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('limit');
    expect(res.body.pagination).toHaveProperty('pages');
    if (res.body.tickets.length > 0) {
      const t = res.body.tickets[0];
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('ticketNumber');
      expect(t).toHaveProperty('subject');
    }
  });

  it('should return empty array when no tickets', async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValue([]);
    vi.mocked(prisma.ticket.count).mockResolvedValue(0);

    const res = await request(app)
      .get('/api/tickets/department')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tickets)).toBe(true);
    expect(res.body.tickets.length).toBe(0);
  });
});

describe('GET /api/knowledge/articles — KB contract', () => {
  it('should return articles array (not null, not undefined)', async () => {
    vi.mocked(prisma.knowledgeArticle.findMany).mockResolvedValue([{ id: 1, titleAr: 'مقال', titleEn: 'Article', contentAr: 'محتوى', contentEn: 'Content', isActive: true, createdAt: new Date(), updatedAt: new Date(), categoryId: 1, createdById: 1 } as any]);
    vi.mocked(prisma.knowledgeArticle.count).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/knowledge/articles')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty('pages');
  });
});

describe('GET /api/knowledge/categories — categories contract', () => {
  it('should return categories with _count.articles', async () => {
    vi.mocked(prisma.knowledgeCategory.findMany).mockResolvedValue([{ id: 1, nameAr: 'قسم', nameEn: 'Category', _count: { articles: 3 } } as any]);

    const res = await request(app)
      .get('/api/knowledge/categories')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('_count');
      expect(res.body[0]._count).toHaveProperty('articles');
    }
  });
});

describe('GET /api/knowledge/suggest — suggest contract', () => {
  it('should return {id, titleAr, titleEn, snippetAr, snippetEn} shape', async () => {
    vi.mocked(prisma.knowledgeArticle.findMany).mockResolvedValue([{ id: 1, titleAr: 'مقال', titleEn: 'Article', contentAr: 'محتوى طويل', contentEn: 'Long content' } as any]);

    const res = await request(app)
      .get('/api/knowledge/suggest?q=test')
      .set('Authorization', `Bearer ${endUserToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      const item = res.body[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('titleAr');
      expect(item).toHaveProperty('titleEn');
      expect(item).toHaveProperty('snippetAr');
      expect(item).toHaveProperty('snippetEn');
    }
  });
});

describe('GET /api/admin/users — user management contract', () => {
  it('should return users with pagination', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 1, fullNameAr: 'مدير', fullNameEn: 'Admin', badgeNumber: '001', username: 'admin', role: 'super_admin', email: 'admin@test.com', isActive: true, departmentId: null, avatarUrl: null, about: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, department: null, userRole: null, permissionsOverride: null } as any]);
    vi.mocked(prisma.user.count).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('limit');
    expect(res.body.pagination).toHaveProperty('pages');
  });
});
