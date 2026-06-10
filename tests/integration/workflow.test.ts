import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { TicketsModule } from '../../src/modules/tickets/tickets.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { GatewaysModule } from '../../src/gateways/gateways.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';

describe('Workflow & Integration E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let agentToken: string;
  let otherAgentToken: string;

  let adminUser: any;
  let agentUser: any;
  let otherAgentUser: any;

  let deptA: any;
  let deptB: any;
  let ticketType: any;

  let createdTicketId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        AuthModule,
        TicketsModule,
        GatewaysModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(express.json());
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);

    // 1. Clean DB using prisma truncate or manual delete (in foreign key safe order)
    await prisma.ticketMessage.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.ticket.deleteMany({});
    await prisma.userPermissionOverride.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.department.deleteMany({});
    await prisma.ticketType.deleteMany({});
    await prisma.deptPermissions.deleteMany({});

    // 2. Setup Base Data
    const hash = await bcrypt.hash('password123', 10);

    const deptPerms = await prisma.deptPermissions.create({
      data: {
        canReceiveTickets: true,
        canSendTickets: true,
        canViewAllDeptTickets: true,
        canAssignTickets: true,
        canChangeStatus: true,
        canTransferTickets: true,
        canArchiveTickets: true,
        canExportData: true,
        canViewAnalytics: true,
        canManageTeamNotes: true,
      },
    });

    deptA = await prisma.department.create({
      data: { nameEn: 'IT', nameAr: 'تقنية المعلومات', defaultPermissionsId: deptPerms.id },
    });

    deptB = await prisma.department.create({
      data: { nameEn: 'Maintenance', nameAr: 'الصيانة', defaultPermissionsId: deptPerms.id },
    });

    ticketType = await prisma.ticketType.create({
      data: { nameEn: 'Hardware', nameAr: 'أجهزة', departmentId: deptA.id },
    });

    // 3. Create Users
    adminUser = await prisma.user.create({
      data: {
        badgeNumber: 'ADMIN99',
        username: 'admin',
        passwordHash: hash,
        role: 'super_admin',
        fullNameEn: 'Super Admin',
        fullNameAr: 'مدير النظام',
        email: 'admin@test.com',
        isActive: true,
      },
    });

    agentUser = await prisma.user.create({
      data: {
        badgeNumber: 'AGENT01',
        username: 'agentA',
        passwordHash: hash,
        role: 'agent',
        fullNameEn: 'IT Agent',
        fullNameAr: 'موظف تقنية المعلومات',
        email: 'agenta@test.com',
        departmentId: deptA.id,
        isActive: true,
      },
    });

    otherAgentUser = await prisma.user.create({
      data: {
        badgeNumber: 'AGENT02',
        username: 'agentB',
        passwordHash: hash,
        role: 'agent',
        fullNameEn: 'Maintenance Agent',
        fullNameAr: 'موظف الصيانة',
        email: 'agentb@test.com',
        departmentId: deptB.id,
        isActive: true,
      },
    });

    // 4. Authenticate Users to get tokens
    let res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'admin', password: 'password123' });
    adminToken = res.body.accessToken;

    res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'agentA', password: 'password123' });
    agentToken = res.body.accessToken;

    res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'agentB', password: 'password123' });
    otherAgentToken = res.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await prisma.ticketMessage.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.ticket.deleteMany({});
    await prisma.userPermissionOverride.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.department.deleteMany({});
    await prisma.ticketType.deleteMany({});
    await prisma.deptPermissions.deleteMany({});
    if (app) await app.close();
  });

  it('Phase 1: Ticket Creation - SLA should start correctly', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        subject: 'Printer broke',
        description: 'The main HP printer is out of ink.',
        departmentId: deptA.id,
        priority: 'high',
      });

    expect(res.status).toBe(201);
    expect(res.body.subject).toBe('Printer broke');
    expect(res.body.status).toBe('pending');
    expect(res.body.slaDeadline).toBeDefined();

    createdTicketId = res.body.id;
  });

  it('Phase 1: Admin Assigns Ticket to Agent (Single Assign)', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/tickets/${createdTicketId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: agentUser.id });

    expect(res.status).toBe(200);
    expect(res.body.assignedToId).toBe(agentUser.id);
  });

  it('Phase 1: Workflow Guard - Reject resolution without Issue Type', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/tickets/${createdTicketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ISSUE_TYPE_REQUIRED');
  });

  it('Phase 1: Backend Guard - Reject resolution without Assigned Agent', async () => {
    await prisma.ticket.update({ where: { id: createdTicketId }, data: { assignedToId: null } });

    const res = await request(app.getHttpServer())
      .put(`/api/tickets/${createdTicketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' });

    expect(res.status).toBe(400);

    await prisma.ticket.update({ where: { id: createdTicketId }, data: { assignedToId: agentUser.id } });
  });

  it('Phase 1: Resolution - Success with Issue Type', async () => {
    await prisma.ticket.update({ where: { id: createdTicketId }, data: { ticketTypeId: ticketType.id } });

    const res = await request(app.getHttpServer())
      .put(`/api/tickets/${createdTicketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved', comment: 'Fixed the ink.' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(res.body.completedAt).toBeDefined();
  });

  it('Phase 1: Bulk Assign Guard - Rejects assignment to another department', async () => {
    const newTicket = await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        subject: 'Internet down',
        description: 'Cannot connect to Wifi',
        departmentId: deptA.id,
      });

    const res = await request(app.getHttpServer())
      .post('/api/tickets/bulk-assign')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        ticketIds: [newTicket.body.id],
        agentId: otherAgentUser.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Agent (Dept');
  });
});
