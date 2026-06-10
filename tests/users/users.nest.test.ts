import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';

describe('NestJS Users API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: ACCESS_SECRET, signOptions: { expiresIn: '8h' } }),
        PrismaModule,
        UsersModule,
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

  it('GET /api/users/me should return user profile', async () => {
    const mockUser = {
      id: 1,
      badgeNumber: 'EMP001',
      username: 'admin',
      fullNameAr: 'مدير',
      fullNameEn: 'Admin',
      role: 'super_admin',
      passwordHash: 'hashed-password',
      department: null,
      permissionsOverride: null,
      avatarUrl: null,
      langPref: 'ar',
      departmentId: null,
      email: null,
      isActive: true,
      forcePasswordChange: false,
      lastLoginAt: null,
      lastLoginIp: null,
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);

    const token = (await import('jsonwebtoken')).default.sign(
      { id: 1, role: 'super_admin', departmentId: null },
      ACCESS_SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.badgeNumber).toBe('EMP001');
    expect(res.body.fullNameAr).toBe('مدير');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('GET /api/users/me should return 404 for non-existent user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const token = (await import('jsonwebtoken')).default.sign(
      { id: 999, role: 'super_admin', departmentId: null },
      ACCESS_SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('GET /api/users/me should return 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('PUT /api/users/profile should update profile', async () => {
    const mockUser = {
      id: 1,
      badgeNumber: 'EMP001',
      username: 'admin',
      fullNameAr: 'مدير محدث',
      fullNameEn: 'Updated Admin',
      role: 'super_admin',
      passwordHash: 'hashed-password',
      department: null,
      permissionsOverride: null,
      avatarUrl: null,
      langPref: 'en',
      departmentId: null,
      email: 'admin@test.com',
      isActive: true,
      forcePasswordChange: false,
      lastLoginAt: null,
      lastLoginIp: null,
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    mockPrisma.user.update.mockResolvedValue(mockUser);

    const token = (await import('jsonwebtoken')).default.sign(
      { id: 1, role: 'super_admin', departmentId: null },
      ACCESS_SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app.getHttpServer())
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullNameAr: 'مدير محدث', fullNameEn: 'Updated Admin', langPref: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.fullNameAr).toBe('مدير محدث');
    expect(res.body.langPref).toBe('en');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('PUT /api/users/profile should return 400 without fullNameAr', async () => {
    const token = (await import('jsonwebtoken')).default.sign(
      { id: 1, role: 'super_admin', departmentId: null },
      ACCESS_SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app.getHttpServer())
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullNameEn: 'No Arabic name' });

    expect(res.status).toBe(400);
  });

  it('PUT /api/users/avatar should return 400 without file', async () => {
    const token = (await import('jsonwebtoken')).default.sign(
      { id: 1, role: 'super_admin', departmentId: null },
      ACCESS_SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app.getHttpServer())
      .put('/api/users/avatar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
