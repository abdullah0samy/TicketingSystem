import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { AdminModule } from '../../src/modules/admin/admin.module';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';

const superAdminToken = jwt.sign({ id: 1, role: 'super_admin', departmentId: null }, ACCESS_SECRET, { expiresIn: '1h' });
const endUserToken = jwt.sign({ id: 2, role: 'end_user', departmentId: 1 }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Admin API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      building: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      floor: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      department: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
      ticketType: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
      user: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      role: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
      permission: { findMany: vi.fn() },
      auditLog: { create: vi.fn() },
      deptPermissions: { create: vi.fn() },
      userPermissionOverride: { findUnique: vi.fn(), update: vi.fn() },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AdminModule],
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

  describe('Buildings', () => {
    it('GET /api/admin/buildings returns list', async () => {
      mockPrisma.building.findMany.mockResolvedValue([{ id: 1, nameAr: 'مبنى ١', nameEn: 'Building 1', _count: { floors: 0 } }]);
      const res = await request(app.getHttpServer()).get('/api/admin/buildings').set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('GET /api/admin/buildings works for any authenticated user', async () => {
      mockPrisma.building.findMany.mockResolvedValue([]);
      const res = await request(app.getHttpServer()).get('/api/admin/buildings').set('Authorization', `Bearer ${endUserToken}`);
      expect(res.status).toBe(200);
    });

    it('GET /api/admin/buildings returns 401 without token', async () => {
      const res = await request(app.getHttpServer()).get('/api/admin/buildings');
      expect(res.status).toBe(401);
    });

    it('POST /api/admin/buildings requires super_admin', async () => {
      const res = await request(app.getHttpServer()).post('/api/admin/buildings').set('Authorization', `Bearer ${endUserToken}`).send({ nameAr: 'Test', nameEn: 'Test' });
      expect(res.status).toBe(403);
    });
  });

  describe('Floors', () => {
    it('GET /api/admin/floors works for any authenticated user', async () => {
      mockPrisma.floor.findMany.mockResolvedValue([]);
      const res = await request(app.getHttpServer()).get('/api/admin/floors').set('Authorization', `Bearer ${endUserToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Users', () => {
    it('GET /api/admin/users returns paginated list', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1, badgeNumber: '001', username: 'user1', fullNameAr: 'User', role: 'end_user' }]);
      mockPrisma.user.count.mockResolvedValue(1);
      const res = await request(app.getHttpServer()).get('/api/admin/users').set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('total', 1);
    });

    it('POST /api/admin/users creates a user', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValue({ id: 3, badgeNumber: '003', username: '003', fullNameAr: 'New User', role: 'agent', passwordHash: '...' });
      const res = await request(app.getHttpServer()).post('/api/admin/users').set('Authorization', `Bearer ${superAdminToken}`).send({ badgeNumber: '003', username: '003', password: 'Test@123', fullNameAr: 'New User', role: 'agent' });
      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('DELETE /api/admin/users/:id deactivates user', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 1, badgeNumber: '001', username: 'user1', role: 'end_user' });
      const res = await request(app.getHttpServer()).delete('/api/admin/users/1').set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('User deactivated');
    });
  });

  describe('Roles', () => {
    it('GET /api/admin/roles returns list', async () => {
      mockPrisma.role.findMany.mockResolvedValue([{ id: 1, name: 'Admin', _count: { users: 0 }, permissions: [] }]);
      const res = await request(app.getHttpServer()).get('/api/admin/roles').set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
    });

    it('GET /api/admin/permissions returns list', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([{ id: 1, name: 'create_ticket' }]);
      const res = await request(app.getHttpServer()).get('/api/admin/permissions').set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
    });
  });
});
