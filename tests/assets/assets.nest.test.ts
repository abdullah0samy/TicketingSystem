import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { AssetsModule } from '../../src/modules/assets/assets.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const adminToken = jwt.sign({ id: 1, role: 'super_admin' }, ACCESS_SECRET, { expiresIn: '1h' });
const supervisorToken = jwt.sign({ id: 2, role: 'supervisor', departmentId: 1 }, ACCESS_SECRET, { expiresIn: '1h' });
const agentToken = jwt.sign({ id: 3, role: 'agent' }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Assets API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      asset: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        AssetsModule,
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

  it('GET /api/assets returns 200 with list', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([{ id: 1, name: 'Scanner', department: null }]);

    const res = await request(app.getHttpServer())
      .get('/api/assets')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/assets returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/assets');
    expect(res.status).toBe(401);
  });

  it('POST /api/assets creates asset as admin', async () => {
    mockPrisma.asset.create.mockResolvedValue({ id: 1, name: 'Test Asset', type: 'hardware', status: 'active' });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Asset', type: 'hardware' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('POST /api/assets returns 403 for agent', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ name: 'Test', type: 'hardware' });
    expect(res.status).toBe(403);
  });

  it('PUT /api/assets/:id returns 404 for non-existent', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .put('/api/assets/999')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/assets/:id returns 204 for admin', async () => {
    mockPrisma.asset.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .delete('/api/assets/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });

  it('DELETE /api/assets/:id returns 403 for supervisor', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/assets/1')
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);
  });
});
