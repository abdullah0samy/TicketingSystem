import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { TicketsModule } from '../../src/modules/tickets/tickets.module';
import { GatewaysModule } from '../../src/gateways/gateways.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const agentToken = jwt.sign({ id: 1, role: 'agent', departmentId: 1, fullNameEn: 'Agent' }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Tickets API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      user: { findUnique: vi.fn(), findMany: vi.fn() },
      department: { findUnique: vi.fn() },
      building: { findUnique: vi.fn() },
      floor: { findUnique: vi.fn() },
      ticketType: { findUnique: vi.fn() },
      ticket: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
      ticketTransfer: { create: vi.fn() },
      ticketMessage: { create: vi.fn() },
      auditLog: { create: vi.fn() },
      userPermissionOverride: { findUnique: vi.fn() },
      deptTransferAllowlist: { findFirst: vi.fn() },
      $transaction: vi.fn((cb: any) => cb(mockPrisma)),
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        TicketsModule,
        GatewaysModule,
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

  it('GET /api/tickets/my returns 200 with pagination', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    mockPrisma.ticket.count.mockResolvedValue(0);

    const res = await request(app.getHttpServer())
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tickets');
    expect(res.body).toHaveProperty('pagination');
  });

  it('GET /api/tickets/my returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/tickets/my');
    expect(res.status).toBe(401);
  });

  it('GET /api/tickets/:id returns 404 for non-existent ticket', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .get('/api/tickets/999')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(404);
  });

  it('GET /api/tickets/:id returns 200 for valid ticket', async () => {
    const mockTicket = {
      id: 1,
      ticketNumber: 'TKT-250101-001',
      subject: 'Test ticket',
      description: 'Test description',
      status: 'pending',
      priority: 'normal',
      departmentId: 1,
      createdById: 2,
      assignedToId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      department: null,
      ticketType: null,
      createdBy: { id: 2, fullNameEn: 'User', fullNameAr: 'مستخدم', avatarUrl: null, badgeNumber: '001' },
      assignedTo: null,
      attachments: [],
      asset: null,
      messages: [],
      auditLogs: [],
      transfers: [],
    };
    mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);

    const res = await request(app.getHttpServer())
      .get('/api/tickets/1')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.ticketNumber).toBe('TKT-250101-001');
  });

  it('POST /api/tickets creates a ticket', async () => {
    const mockUser = { id: 1, departmentId: 1, fullNameEn: 'Agent', fullNameAr: 'وكيل', department: { nameEn: 'IT' } };
    const mockDept = { id: 1, nameEn: 'IT', slaHours: 24 };
    const mockTicket = { id: 1, ticketNumber: 'TKT-250101-001', subject: 'Test', status: 'pending' };

    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.department.findUnique.mockResolvedValue(mockDept);
    mockPrisma.ticket.findFirst.mockResolvedValue(null);
    mockPrisma.ticket.create.mockResolvedValue(mockTicket);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    const res = await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ description: 'Test ticket description', departmentId: 1, subject: 'Test' });

    expect(res.status).toBe(201);
  });

  it('PUT /api/tickets/:id/status returns 404 for non-existent ticket', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .put('/api/tickets/999/status')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'open' });

    expect(res.status).toBe(404);
  });

  it('GET /api/tickets/search returns 200', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    mockPrisma.ticket.count.mockResolvedValue(0);

    const res = await request(app.getHttpServer())
      .get('/api/tickets/search?q=test')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pagination');
  });
});
