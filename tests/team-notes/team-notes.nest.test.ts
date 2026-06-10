import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { TeamNotesModule } from '../../src/modules/team-notes/team-notes.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const adminToken = jwt.sign({ id: 1, role: 'super_admin' }, ACCESS_SECRET, { expiresIn: '1h' });
const agentToken = jwt.sign({ id: 2, role: 'agent', departmentId: 1 }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Team Notes API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      user: { findUnique: vi.fn() },
      teamNote: { findMany: vi.fn(), create: vi.fn() },
      teamNoteComment: { create: vi.fn() },
      teamNoteLike: { findUnique: vi.fn(), delete: vi.fn(), create: vi.fn() },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        TeamNotesModule,
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

  it('GET /api/team-notes returns 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: 1, role: 'agent' });
    mockPrisma.teamNote.findMany.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .get('/api/team-notes')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/team-notes returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/team-notes');
    expect(res.status).toBe(401);
  });

  it('POST /api/team-notes creates a note', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: 1, role: 'agent' });
    mockPrisma.teamNote.create.mockResolvedValue({ id: 1, body: 'Test note', author: {}, attachments: [], comments: [], likes: [] });

    const res = await request(app.getHttpServer())
      .post('/api/team-notes')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ body: 'Test note' });

    expect(res.status).toBe(201);
  });

  it('POST /api/team-notes/:id/comments adds a comment', async () => {
    mockPrisma.teamNoteComment.create.mockResolvedValue({ id: 1, body: 'Nice note', author: {} });

    const res = await request(app.getHttpServer())
      .post('/api/team-notes/1/comments')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ body: 'Nice note' });

    expect(res.status).toBe(201);
  });

  it('POST /api/team-notes/:id/like toggles like on', async () => {
    mockPrisma.teamNoteLike.findUnique.mockResolvedValue(null);
    mockPrisma.teamNoteLike.create.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .post('/api/team-notes/1/like')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ liked: true });
  });

  it('POST /api/team-notes/:id/like toggles like off', async () => {
    mockPrisma.teamNoteLike.findUnique.mockResolvedValue({ id: 1 });
    mockPrisma.teamNoteLike.delete.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .post('/api/team-notes/1/like')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ liked: false });
  });
});
