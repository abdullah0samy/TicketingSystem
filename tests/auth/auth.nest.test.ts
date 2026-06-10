import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ThrottlerModule } from '@nestjs/throttler';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

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
  };
}

describe('NestJS Auth API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        AuthModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(express.json());
    app.use(cookieParser());
    await app.init();
  }, 20000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should return 200 with accessToken and cookie for valid credentials', async () => {
    const user = mockUser();
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.user.update.mockResolvedValue(user);

    const res = await request(app.getHttpServer())
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
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.user.update.mockResolvedValue(user);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'EMP001', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('should return 401 with non-existent user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'NONEXIST', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('should return 401 with inactive user', async () => {
    const user = mockUser({ isActive: false });
    mockPrisma.user.findFirst.mockResolvedValue(user);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'EMP001', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('should return 423 with lockUntil when account is locked', async () => {
    const lockUntil = new Date(Date.now() + 3600000);
    const user = mockUser({ failedLoginAttempts: 5, lockUntil });
    mockPrisma.user.findFirst.mockResolvedValue(user);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'EMP001', password: 'password123' });

    expect(res.status).toBe(423);
    expect(res.body.lockUntil).toBeDefined();
  });

  it('should return 200 with new accessToken for valid cookie', async () => {
    const user = mockUser();
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    mockPrisma.user.findUnique.mockResolvedValue(user);

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('should return 403 with expired cookie', async () => {
    const refreshToken = jwt.sign({ id: 1 }, REFRESH_SECRET, { expiresIn: '0s' });

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);

    expect(res.status).toBe(403);
  });

  it('should return 403 with tampered cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', ['refreshToken=tampered.token.here']);

    expect(res.status).toBe(403);
  });

  it('should return 401 with no cookie', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('should return 200 and clear cookie', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/logout');
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes('refreshToken=;'))).toBe(true);
  });
});
