import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { CronService } from '../../src/modules/jobs/cron.service';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import type { INestApplication } from '@nestjs/common';

describe('NestJS Background Jobs', () => {
  let app: INestApplication;
  let cronService: CronService;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      ticket: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
      user: { findMany: vi.fn(), findFirst: vi.fn() },
      notification: { createMany: vi.fn() },
      auditLog: { create: vi.fn() },
      exportHistory: { findMany: vi.fn(), deleteMany: vi.fn() },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
      ],
      providers: [CronService],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(express.json());
    app.use(cookieParser());
    await app.init();

    cronService = app.get(CronService);
  }, 20000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('module compiles', () => {
    expect(app).toBeDefined();
  });

  it('sla check creates notifications for breached tickets', async () => {
    const breachedTicket = {
      id: 1, ticketNumber: 'TKT-001', departmentId: 1,
      slaDeadline: new Date(Date.now() - 3600000),
      createdAt: new Date(Date.now() - 7200000),
      slaBreachSent: false, slaWarningSent: false,
      status: 'open', subject: 'Test'
    };

    mockPrisma.ticket.findMany
      .mockResolvedValueOnce([breachedTicket])
      .mockResolvedValueOnce([]);

    mockPrisma.user.findMany.mockResolvedValue([{ id: 10, isActive: true }]);

    await cronService.slaCheck();

    expect(mockPrisma.notification.createMany).toHaveBeenCalled();
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ slaBreachSent: true }) })
    );
  });

  it('sla check creates warnings for tickets at 80%+', async () => {
    const warningTicket = {
      id: 3, ticketNumber: 'TKT-003', departmentId: 2,
      slaDeadline: new Date(Date.now() + 600000), // 10 min left
      createdAt: new Date(Date.now() - 5400000),  // 90 min ago (total 100 min SLA)
      slaBreachSent: false, slaWarningSent: false,
      status: 'in_progress', subject: 'Test Warning'
    };

    mockPrisma.ticket.findMany
      .mockResolvedValueOnce([])       // no breached
      .mockResolvedValueOnce([warningTicket]);

    mockPrisma.user.findMany.mockResolvedValue([{ id: 11, isActive: true }]);

    await cronService.slaCheck();

    expect(mockPrisma.notification.createMany).toHaveBeenCalled();
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3 }, data: expect.objectContaining({ slaWarningSent: true }) })
    );
  });

  it('auto archive archives old resolved tickets', async () => {
    const oldTicket = {
      id: 2, ticketNumber: 'TKT-002', departmentId: 1,
      status: 'resolved',
      completedAt: new Date(Date.now() - 40 * 86400000),
      isArchived: false
    };

    mockPrisma.ticket.findMany.mockResolvedValue([oldTicket]);
    mockPrisma.user.findFirst.mockResolvedValue({ id: 1 });

    await cronService.autoArchive();

    expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 }, data: expect.objectContaining({ isArchived: true }) })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('auto archive does nothing when no tickets qualify', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    await cronService.autoArchive();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });
});
