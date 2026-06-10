import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { ProfileModule } from '../../src/modules/profile/profile.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const userToken = jwt.sign({ id: 1, role: 'agent', departmentId: 1, fullNameEn: 'Agent' }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Profile API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      user: { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        ProfileModule,
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

  it('GET /api/profile returns 200 with user data', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 1, badgeNumber: 'A001', fullNameEn: 'Agent', department: { nameAr: 'IT', nameEn: 'IT' } });

    const res = await request(app.getHttpServer())
      .get('/api/profile')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 1);
  });

  it('GET /api/profile returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/profile');
    expect(res.status).toBe(401);
  });

  it('GET /api/profile returns 404 if user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .get('/api/profile')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
  });

  it('PUT /api/profile updates avatarUrl and about', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 1, avatarUrl: 'new-avatar.jpg', about: 'About me', department: null });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .put('/api/profile')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ avatarUrl: 'new-avatar.jpg', about: 'About me' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('avatarUrl', 'new-avatar.jpg');
  });

  it('PUT /api/profile returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).put('/api/profile').send({ about: 'test' });
    expect(res.status).toBe(401);
  });
});
