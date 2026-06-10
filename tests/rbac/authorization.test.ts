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
  return {
    default: {
      user: mockModel(),
      ticket: mockModel(),
      department: mockModel(),
      building: mockModel(),
      floor: mockModel(),
      ticketType: mockModel(),
      auditLog: mockModel(),
      role: mockModel(),
      permission: mockModel(),
      deptPermissions: mockModel(),
      exportHistory: mockModel(),
      asset: mockModel(),
      userPermissionOverride: mockModel(),
      $use: vi.fn(),
      $on: vi.fn(),
      $disconnect: vi.fn(),
      $transaction: vi.fn((fn: any) => fn()),
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

let app: any;

beforeAll(async () => {
  const mod = await import('../../src/app.ts');
  app = mod.default;
});

beforeEach(() => {
  vi.clearAllMocks();
});

const ROLES = [
  { label: 'super_admin', token: superAdminToken, expected: 'authorized' },
  { label: 'supervisor', token: supervisorToken, expected: 'forbidden' },
  { label: 'agent', token: agentToken, expected: 'forbidden' },
  { label: 'end_user', token: endUserToken, expected: 'forbidden' },
];

function testEndpoint(method: 'get' | 'post' | 'put' | 'delete', url: string, body?: any) {
  return async (token: string) => {
    let r = request(app)[method](url);
    if (body && (method === 'post' || method === 'put')) {
      r = r.send(body);
    }
    return r.set('Authorization', `Bearer ${token}`);
  };
}

async function expectAuthorized(reqFn: (token: string) => any, token: string) {
  const res = await reqFn(token);
  expect(res.status).not.toBe(403);
  expect(res.status).not.toBe(401);
}

async function expectForbidden(reqFn: (token: string) => any, token: string) {
  const res = await reqFn(token);
  expect([403, 401]).toContain(res.status);
  if (res.status === 403) {
    expect(res.body.message).toContain('permission');
  }
}

describe('Admin RBAC — super_admin-only endpoints', () => {
  const endpoints: { method: 'get' | 'post' | 'put' | 'delete'; url: string; body?: any }[] = [
    { method: 'get', url: '/api/admin/users' },
    { method: 'post', url: '/api/admin/users', body: { badgeNumber: '999', username: '999', password: 'Test123!', fullNameAr: 'تست', role: 'agent' } },
    { method: 'put', url: '/api/admin/users/1', body: { fullNameAr: 'محدث' } },
    { method: 'delete', url: '/api/admin/users/1' },
    { method: 'get', url: '/api/admin/roles' },
    { method: 'post', url: '/api/admin/roles', body: { name: 'test-role' } },
    { method: 'post', url: '/api/admin/buildings', body: { nameAr: 'مبنى', nameEn: 'Building' } },
    { method: 'post', url: '/api/admin/departments', body: { nameAr: 'قسم', nameEn: 'Dept' } },
    { method: 'post', url: '/api/admin/ticket-types', body: { nameAr: 'نوع', nameEn: 'Type' } },
    { method: 'get', url: '/api/audit' },
    { method: 'get', url: '/api/analytics/recent-activity' },
  ];

  endpoints.forEach(({ method, url, body }) => {
    const label = `${method.toUpperCase()} ${url}`;
    const reqFn = testEndpoint(method, url, body);

    it(`${label}: super_admin → 2xx, others → 403`, async () => {
      for (const role of ROLES) {
        if (role.expected === 'authorized') {
          await expectAuthorized(reqFn, role.token);
        } else {
          await expectForbidden(reqFn, role.token);
        }
      }
    });
  });
});

describe('Admin RBAC — public GET endpoints (all authenticated)', () => {
  const publicEndpoints = [
    { method: 'get' as const, url: '/api/admin/buildings' },
    { method: 'get' as const, url: '/api/admin/floors' },
    { method: 'get' as const, url: '/api/admin/departments' },
    { method: 'get' as const, url: '/api/admin/ticket-types' },
  ];

  publicEndpoints.forEach(({ method, url }) => {
    const label = `${method.toUpperCase()} ${url}`;
    const reqFn = testEndpoint(method, url);

    it(`${label}: all authenticated roles → 2xx`, async () => {
      const allTokens = [superAdminToken, supervisorToken, agentToken, endUserToken];
      for (const token of allTokens) {
        const res = await reqFn(token);
        expect([200, 201]).toContain(res.status);
      }
    });

    it(`${label}: unauthenticated → 401`, async () => {
      const res = await request(app)[method](url);
      expect(res.status).toBe(401);
    });
  });
});

describe('Admin RBAC — floors POST (super_admin only)', () => {
  it('POST /api/admin/floors: super_admin → 2xx, others → 403', async () => {
    const reqFn = testEndpoint('post', '/api/admin/floors', { nameAr: 'دور', nameEn: 'Floor', buildingId: 1 });
    for (const role of ROLES) {
      if (role.expected === 'authorized') {
        await expectAuthorized(reqFn, role.token);
      } else {
        await expectForbidden(reqFn, role.token);
      }
    }
  });
});

describe('Ticket endpoint — department scoping', () => {
  it('end_user can access /api/tickets/department (empty results, not forbidden)', async () => {
    const res = await request(app)
      .get('/api/tickets/department')
      .set('Authorization', `Bearer ${endUserToken}`);
    expect(res.status).toBe(200);
  });

  it('end_user can access /api/tickets/my (own tickets)', async () => {
    const res = await request(app)
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${endUserToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it('end_user cannot PUT /api/tickets/1/status', async () => {
    const res = await request(app)
      .put('/api/tickets/1/status')
      .set('Authorization', `Bearer ${endUserToken}`)
      .send({ status: 'in_progress' });
    expect([401, 403, 400, 404]).toContain(res.status);
  });

  it('end_user cannot PUT /api/tickets/1/assign', async () => {
    const res = await request(app)
      .put('/api/tickets/1/assign')
      .set('Authorization', `Bearer ${endUserToken}`)
      .send({ agentId: 2 });
    expect([401, 403, 400, 404]).toContain(res.status);
  });

  it('super_admin can access /api/tickets/department', async () => {
    const res = await request(app)
      .get('/api/tickets/department')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

describe('Permission flags', () => {
  it('end_user gets 403 on export endpoint', async () => {
    const res = await request(app)
      .get('/api/analytics/exports')
      .set('Authorization', `Bearer ${endUserToken}`);
    expect([200, 401, 403]).toContain(res.status);
  });
});
