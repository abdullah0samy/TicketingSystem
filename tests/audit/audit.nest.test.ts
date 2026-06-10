import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { AuditModule } from '../../src/modules/audit/audit.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const adminToken = jwt.sign({ id: 1, role: 'super_admin' }, ACCESS_SECRET, { expiresIn: '1h' });
const agentToken = jwt.sign({ id: 2, role: 'agent' }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Audit API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      auditLog: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        AuditModule,
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

  it('GET /api/audit returns 200 with logs and pagination', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([{ id: 1, action: 'LOGIN', user: { fullNameEn: 'Admin' }, department: null, ticket: null }]);
    mockPrisma.auditLog.count.mockResolvedValue(1);

    const res = await request(app.getHttpServer())
      .get('/api/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logs');
    expect(res.body).toHaveProperty('pagination');
  });

  it('GET /api/audit returns 403 for non-admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/audit returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/audit');
    expect(res.status).toBe(401);
  });

  it('GET /api/audit/actions returns 200 with list', async () => {
    mockPrisma.auditLog.groupBy.mockResolvedValue([{ action: 'LOGIN' }, { action: 'LOGOUT' }]);

    const res = await request(app.getHttpServer())
      .get('/api/audit/actions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
