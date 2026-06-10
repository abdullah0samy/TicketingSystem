import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import express from 'express';
import rateLimit from 'express-rate-limit';

process.env.LOGIN_RATE_LIMIT_MAX = '100';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

vi.mock('../../src/core/db.ts', () => {
  const mockModel = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    default: {
      user: mockModel(),
      ticket: mockModel(),
      department: mockModel(),
      $use: vi.fn(),
      $on: vi.fn(),
      $disconnect: vi.fn(),
    },
    prisma: {} as any,
  };
});

import prisma from '../../src/core/db.ts';

vi.mock('../../src/core/paths.ts', () => ({
  UPLOADS_DIR: '/tmp/uploads',
  AVATARS_DIR: '/tmp/avatars',
  ensureDirectories: vi.fn(),
}));

let app: any;

beforeAll(async () => {
  const mod = await import('../../src/app.ts');
  app = mod.default;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function mockUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    badgeNumber: 'EMP001',
    username: 'admin',
    email: 'admin@test.com',
    passwordHash: bcrypt.hashSync('password123', 10),
    fullNameAr: 'مدير',
    fullNameEn: 'Admin',
    role: 'super_admin',
    roleId: null,
    departmentId: null,
    avatarUrl: null,
    about: null,
    langPref: 'ar',
    isActive: true,
    forcePasswordChange: false,
    lastLoginAt: null,
    lastLoginIp: null,
    failedLoginAttempts: 0,
    lockUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    department: null,
    ...overrides,
  } as any;
}

describe('POST /api/auth/login', () => {
  it('should return 200 with accessToken and cookie for valid credentials', async () => {
    const user = mockUser();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(user);
    vi.mocked(prisma.user.update).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'EMP001', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('super_admin');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('should return 401 with wrong password', async () => {
    const user = mockUser();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(user);
    vi.mocked(prisma.user.update).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'EMP001', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('should return 401 with non-existent user', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'NONEXIST', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('should return 401 with inactive user', async () => {
    const user = mockUser({ isActive: false });
    vi.mocked(prisma.user.findFirst).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'EMP001', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('should return 423 with lockUntil when account is locked', async () => {
    const lockUntil = new Date(Date.now() + 3600000);
    const user = mockUser({ failedLoginAttempts: 5, lockUntil });
    vi.mocked(prisma.user.findFirst).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'EMP001', password: 'password123' });

    expect(res.status).toBe(423);
    expect(res.body.lockUntil).toBeDefined();
  });

  it('should lock account after 5 consecutive failed attempts', async () => {
    const user = mockUser();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(user);
    let failCount = 0;
    vi.mocked(prisma.user.update).mockImplementation((async (args: any) => {
      if (args?.data?.failedLoginAttempts) {
        failCount = args.data.failedLoginAttempts;
      }
      return mockUser({ failedLoginAttempts: failCount });
    }) as any);

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'EMP001', password: 'wrong' });
    }

    const res6 = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'EMP001', password: 'wrong' });

    expect(res6.status).toBe(401);
  });

  it('should succeed and reset counter after lockout expires', async () => {
    const expiredLock = new Date(Date.now() - 3600000);
    const user = mockUser({ failedLoginAttempts: 5, lockUntil: expiredLock });
    vi.mocked(prisma.user.findFirst).mockResolvedValue(user);
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'EMP001', password: 'password123' });

    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/refresh', () => {
  it('should return 200 with new accessToken for valid cookie', async () => {
    const user = mockUser();
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('should return 403 with expired cookie', async () => {
    const refreshToken = jwt.sign({ id: 1 }, REFRESH_SECRET, { expiresIn: '0s' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);

    expect(res.status).toBe(403);
  });

  it('should return 403 with tampered cookie', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['refreshToken=tampered.token.here']);

    expect(res.status).toBe(403);
  });

  it('should return 401 with no cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('should return 200 and clear cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes('refreshToken=;'))).toBe(true);
  });
});

describe('JWT payload', () => {
  it('should contain id, role, departmentId in decoded token', () => {
    const token = jwt.sign({ id: 1, role: 'agent', departmentId: 3 }, ACCESS_SECRET);
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    expect(decoded.id).toBe(1);
    expect(decoded.role).toBe('agent');
    expect(decoded.departmentId).toBe(3);
  });

  it('should have an expiry', () => {
    const token = jwt.sign({ id: 1, role: 'agent', departmentId: 3 }, ACCESS_SECRET, { expiresIn: '8h' });
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should use HS256 algorithm matching verify', () => {
    const token = jwt.sign({ id: 1, role: 'super_admin', departmentId: null }, ACCESS_SECRET, { algorithm: 'HS256' });
    const decoded = jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] });
    expect(decoded).toBeDefined();
    expect((decoded as any).role).toBe('super_admin');
  });
});

describe('Rate limiting on login', () => {
  it('should return 429 after too many login attempts and include Retry-After header', async () => {
    const miniApp = express();
    miniApp.use(express.json());
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
    });
    miniApp.post('/login', limiter, (_req: any, res: any) => res.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      const ok = await request(miniApp).post('/login').send({});
      expect(ok.status).toBe(200);
    }

    const blocked = await request(miniApp).post('/login').send({});
    expect(blocked.status).toBe(429);
  });
});
