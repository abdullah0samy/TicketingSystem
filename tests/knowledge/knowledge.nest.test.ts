import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { KnowledgeModule } from '../../src/modules/knowledge/knowledge.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const adminToken = jwt.sign({ id: 1, role: 'super_admin' }, ACCESS_SECRET, { expiresIn: '1h' });
const agentToken = jwt.sign({ id: 2, role: 'agent' }, ACCESS_SECRET, { expiresIn: '1h' });
const endUserToken = jwt.sign({ id: 3, role: 'end_user', departmentId: null }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Knowledge Base API', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      knowledgeArticle: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      knowledgeCategory: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
      userPermissionOverride: { findUnique: vi.fn() },
      department: { findUnique: vi.fn() },
      auditLog: { create: vi.fn() },
      $use: vi.fn().mockReturnThis(),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        PrismaModule,
        KnowledgeModule,
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

  it('GET /api/knowledge/articles returns 200 with pagination', async () => {
    mockPrisma.knowledgeArticle.findMany.mockResolvedValue([{
      id: 1, titleAr: 'عنوان', titleEn: 'Title', contentAr: 'محتوى', contentEn: 'Content',
      categoryId: 1, authorId: 1, views: 10, isActive: true,
      category: { id: 1, nameAr: 'قسم', nameEn: 'Category' },
      author: { fullNameAr: 'مدير', fullNameEn: 'Admin' }
    }]);
    mockPrisma.knowledgeArticle.count.mockResolvedValue(1);

    const res = await request(app.getHttpServer())
      .get('/api/knowledge/articles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
  });

  it('GET /api/knowledge/articles returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/knowledge/articles');
    expect(res.status).toBe(401);
  });

  it('GET /api/knowledge/categories returns 200', async () => {
    mockPrisma.knowledgeCategory.findMany.mockResolvedValue([
      { id: 1, nameAr: 'قسم', nameEn: 'Category', _count: { articles: 5 } }
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/knowledge/categories')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/knowledge/search returns 200', async () => {
    mockPrisma.knowledgeArticle.findMany.mockResolvedValue([]);
    mockPrisma.knowledgeArticle.count.mockResolvedValue(0);

    const res = await request(app.getHttpServer())
      .get('/api/knowledge/search?q=test')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
  });

  it('GET /api/knowledge/suggest returns 200 with empty query', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/knowledge/suggest?q=ab')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/knowledge/suggest returns top 3 articles', async () => {
    mockPrisma.knowledgeArticle.findMany.mockResolvedValue([
      { id: 1, titleAr: 'نصيحة', titleEn: 'Tip', contentAr: 'محتوى طويل جدا', contentEn: 'Very long content here',
        views: 10, category: { id: 1, nameAr: 'قسم', nameEn: 'Category' } }
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/knowledge/suggest?q=help+with+something')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('snippetEn');
      expect(res.body[0]).toHaveProperty('snippetAr');
    }
  });

  it('POST /api/knowledge/articles creates article as super_admin', async () => {
    mockPrisma.userPermissionOverride.findUnique.mockResolvedValue(null);
    mockPrisma.knowledgeArticle.create.mockResolvedValue({
      id: 1, titleAr: 'عنوان', titleEn: 'Title', contentAr: 'محتوى', contentEn: 'Content',
      categoryId: 1, authorId: 1, views: 0, isActive: true,
      category: { id: 1, nameAr: 'قسم', nameEn: 'Category' }
    });

    const res = await request(app.getHttpServer())
      .post('/api/knowledge/articles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ titleAr: 'عنوان', titleEn: 'Title', contentAr: 'محتوى', contentEn: 'Content', categoryId: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('POST /api/knowledge/articles returns 400 with missing fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/knowledge/articles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ titleAr: 'عنوان' });

    expect(res.status).toBe(400);
  });

  it('POST /api/knowledge/articles returns 403 for end_user', async () => {
    mockPrisma.userPermissionOverride.findUnique.mockResolvedValue(null);
    mockPrisma.department.findUnique.mockResolvedValue({
      defaultPermissions: { canManageKnowledgeBase: false }
    });

    const res = await request(app.getHttpServer())
      .post('/api/knowledge/articles')
      .set('Authorization', `Bearer ${endUserToken}`)
      .send({ titleAr: 'عنوان', titleEn: 'Title', contentAr: 'محتوى', contentEn: 'Content', categoryId: 1 });

    expect(res.status).toBe(403);
  });

  it('PUT /api/knowledge/articles/:id updates article', async () => {
    mockPrisma.knowledgeArticle.findUnique.mockResolvedValue({
      id: 1, titleAr: 'قديم', titleEn: 'Old'
    });
    mockPrisma.knowledgeArticle.update.mockResolvedValue({
      id: 1, titleAr: 'جديد', titleEn: 'New', contentAr: 'محتوى', contentEn: 'Content',
      categoryId: 1, authorId: 1, views: 0, isActive: true,
      category: { id: 1, nameAr: 'قسم', nameEn: 'Category' }
    });

    const res = await request(app.getHttpServer())
      .put('/api/knowledge/articles/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ titleAr: 'جديد', titleEn: 'New', contentAr: 'محتوى', contentEn: 'Content', categoryId: 1 });

    expect(res.status).toBe(200);
  });

  it('PUT /api/knowledge/articles/:id returns 404 for non-existent', async () => {
    mockPrisma.knowledgeArticle.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .put('/api/knowledge/articles/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ titleAr: 'جديد', titleEn: 'New', contentAr: 'محتوى', contentEn: 'Content', categoryId: 1 });

    expect(res.status).toBe(404);
  });

  it('DELETE /api/knowledge/articles/:id returns 204', async () => {
    mockPrisma.knowledgeArticle.findUnique.mockResolvedValue({ id: 1, titleAr: 'عنوان', titleEn: 'Title' });

    const res = await request(app.getHttpServer())
      .delete('/api/knowledge/articles/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('POST /api/knowledge/articles/:id/view returns 204', async () => {
    mockPrisma.knowledgeArticle.update.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .post('/api/knowledge/articles/1/view')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('POST /api/knowledge/categories creates category', async () => {
    mockPrisma.knowledgeCategory.create.mockResolvedValue({ id: 1, nameAr: 'قسم', nameEn: 'Category' });

    const res = await request(app.getHttpServer())
      .post('/api/knowledge/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameAr: 'قسم', nameEn: 'Category' });

    expect(res.status).toBe(201);
  });

  it('PUT /api/knowledge/categories/:id updates category', async () => {
    mockPrisma.knowledgeCategory.findUnique.mockResolvedValue({ id: 1, nameAr: 'قديم', nameEn: 'Old' });
    mockPrisma.knowledgeCategory.update.mockResolvedValue({ id: 1, nameAr: 'جديد', nameEn: 'New' });

    const res = await request(app.getHttpServer())
      .put('/api/knowledge/categories/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameAr: 'جديد', nameEn: 'New' });

    expect(res.status).toBe(200);
  });

  it('DELETE /api/knowledge/categories/:id returns 400 with articles', async () => {
    mockPrisma.knowledgeArticle.count.mockResolvedValue(3);

    const res = await request(app.getHttpServer())
      .delete('/api/knowledge/categories/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('DELETE /api/knowledge/categories/:id returns 204 when empty', async () => {
    mockPrisma.knowledgeArticle.count.mockResolvedValue(0);
    mockPrisma.knowledgeCategory.findUnique.mockResolvedValue({ id: 2, nameAr: 'فارغ', nameEn: 'Empty' });

    const res = await request(app.getHttpServer())
      .delete('/api/knowledge/categories/2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });
});
