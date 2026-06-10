import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { NotificationsModule } from '../../src/modules/notifications/notifications.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const userToken = jwt.sign({ id: 1, role: 'agent' }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Notifications API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      notification: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      pushSubscription: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        NotificationsModule,
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

  it('GET /api/notifications returns 200 with data and unreadCount', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([{ id: 1, userId: 1, eventType: 'TICKET_ASSIGNED', titleEn: 'New ticket', isRead: false, ticket: null }]);
    mockPrisma.notification.count.mockResolvedValueOnce(1);
    mockPrisma.notification.count.mockResolvedValueOnce(1);

    const res = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('unreadCount');
    expect(res.body).toHaveProperty('pagination');
  });

  it('GET /api/notifications returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('PUT /api/notifications/:id/read marks notification as read', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 1, userId: 1 });
    mockPrisma.notification.update.mockResolvedValue({ id: 1, isRead: true });

    const res = await request(app.getHttpServer())
      .put('/api/notifications/1/read')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
  });

  it('PUT /api/notifications/:id/read returns 404 for non-existent', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .put('/api/notifications/999/read')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
  });

  it('PUT /api/notifications/read-all marks all as read', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

    const res = await request(app.getHttpServer())
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('POST /api/notifications/subscribe creates push subscription', async () => {
    mockPrisma.pushSubscription.findFirst.mockResolvedValue(null);
    mockPrisma.pushSubscription.create.mockResolvedValue({ id: 1, userId: 1, endpoint: 'https://example.com', p256dh: 'key', auth: 'auth' });

    const res = await request(app.getHttpServer())
      .post('/api/notifications/subscribe')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ endpoint: 'https://example.com', p256dh: 'key', auth: 'auth' });

    expect(res.status).toBe(201);
  });

  it('POST /api/notifications/subscribe returns existing subscription if duplicate', async () => {
    mockPrisma.pushSubscription.findFirst.mockResolvedValue({ id: 1, userId: 1, endpoint: 'https://example.com' });

    const res = await request(app.getHttpServer())
      .post('/api/notifications/subscribe')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ endpoint: 'https://example.com', p256dh: 'key', auth: 'auth' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
  });

  it('DELETE /api/notifications/subscribe unsubscribes', async () => {
    mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app.getHttpServer())
      .delete('/api/notifications/subscribe')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ endpoint: 'https://example.com' });

    expect(res.status).toBe(204);
  });
});
