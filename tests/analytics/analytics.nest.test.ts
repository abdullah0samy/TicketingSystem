import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { AnalyticsModule } from '../../src/modules/analytics/analytics.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const superAdminToken = jwt.sign({ id: 1, role: 'super_admin', departmentId: null, fullNameEn: 'Admin' }, ACCESS_SECRET, { expiresIn: '1h' });
const agentToken = jwt.sign({ id: 2, role: 'agent', departmentId: 1, fullNameEn: 'Agent' }, ACCESS_SECRET, { expiresIn: '1h' });
const endUserToken = jwt.sign({ id: 3, role: 'end_user', departmentId: null, fullNameEn: 'User' }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Analytics API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      ticket: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), groupBy: vi.fn(), create: vi.fn(), update: vi.fn() },
      department: { findMany: vi.fn() },
      auditLog: { findMany: vi.fn() },
      user: { findMany: vi.fn() },
      asset: { findMany: vi.fn() },
      exportHistory: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
      ticketStatusHistory: { findMany: vi.fn() },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        AnalyticsModule,
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

  it('GET /api/analytics/stats returns 200', async () => {
    mockPrisma.ticket.count.mockResolvedValue(10);
    mockPrisma.ticket.findMany.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .get('/api/analytics/stats')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('pending');
    expect(res.body).toHaveProperty('resolved');
    expect(res.body).toHaveProperty('open');
    expect(res.body).toHaveProperty('overdue');
  });

  it('GET /api/analytics/stats returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/analytics/stats');
    expect(res.status).toBe(401);
  });

  it('GET /api/analytics/status-distribution returns 200', async () => {
    mockPrisma.ticket.groupBy.mockResolvedValue([{ status: 'open', _count: { _all: 5 } }, { status: 'resolved', _count: { _all: 3 } }]);

    const res = await request(app.getHttpServer())
      .get('/api/analytics/status-distribution')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/analytics/priority-distribution returns 200', async () => {
    mockPrisma.ticket.groupBy.mockResolvedValue([{ priority: 'high', _count: { _all: 5 } }]);

    const res = await request(app.getHttpServer())
      .get('/api/analytics/priority-distribution')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/analytics/dashboard-summary returns 200 for super_admin', async () => {
    mockPrisma.ticket.count.mockResolvedValue(0);
    mockPrisma.ticket.groupBy.mockResolvedValue([]);
    mockPrisma.department.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.asset.findMany.mockResolvedValue([]);
    mockPrisma.exportHistory.findMany.mockResolvedValue([]);
    mockPrisma.ticket.findMany.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .get('/api/analytics/dashboard-summary')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stats');
    expect(res.body).toHaveProperty('statusDistribution');
    expect(res.body).toHaveProperty('priorityDistribution');
    expect(res.body).toHaveProperty('departmentPerformance');
    expect(res.body).toHaveProperty('recentActivity');
    expect(res.body).toHaveProperty('agentPerformance');
    expect(res.body).toHaveProperty('exportHistory');
    expect(res.body).toHaveProperty('assetSummary');
  });

  it('GET /api/analytics/department-performance returns 403 for agent', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/analytics/department-performance')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/analytics/recent-activity returns 403 for agent', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/analytics/recent-activity')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/analytics/agent-performance returns 403 for end_user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/analytics/agent-performance')
      .set('Authorization', `Bearer ${endUserToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/analytics/aht returns 200', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    mockPrisma.ticketStatusHistory.findMany.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .get('/api/analytics/aht')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overallAhtHours');
    expect(res.body).toHaveProperty('totalResolved');
    expect(res.body).toHaveProperty('ahtByPriority');
    expect(res.body).toHaveProperty('ahtByDepartment');
  });

  it('GET /api/analytics/exports returns 200', async () => {
    mockPrisma.exportHistory.findMany.mockResolvedValue([]);
    mockPrisma.exportHistory.count.mockResolvedValue(0);

    const res = await request(app.getHttpServer())
      .get('/api/analytics/exports')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
  });
});
