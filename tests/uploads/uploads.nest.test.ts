import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { UploadsModule } from '../../src/modules/uploads/uploads.module';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import type { INestApplication } from '@nestjs/common';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const userToken = jwt.sign({ id: 1, role: 'agent' }, ACCESS_SECRET, { expiresIn: '1h' });

describe('NestJS Uploads API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'login', ttl: 600000, limit: 100 }]),
        UploadsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(express.json());
    app.use(cookieParser());
    await app.init();
  }, 20000);

  afterAll(async () => {
    // cleanup test uploads
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      for (const f of files) {
        if (f.startsWith('file-')) fs.unlinkSync(path.join(uploadDir, f));
      }
    }
    if (app) await app.close();
  });

  it('POST /api/uploads returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).post('/api/uploads');
    expect(res.status).toBe(401);
  });

  it('GET /api/uploads/download/:filename returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/uploads/download/test.pdf');
    expect(res.status).toBe(401);
  });

  it('GET /api/uploads/download/:filename returns 404 for missing file', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/uploads/download/nonexistent.pdf')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it('POST /api/uploads uploads a PNG file and returns metadata', async () => {
    // minimal valid PNG (1x1 pixel)
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
      0xAE, 0x42, 0x60, 0x82,
    ]);

    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', pngBuffer, 'test-image.png');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('fileName', 'test-image.png');
    expect(res.body).toHaveProperty('fileUrl');
    expect(res.body).toHaveProperty('fileSize');
    expect(res.body).toHaveProperty('mimeType', 'image/png');
  });

  it('POST /api/uploads rejects invalid file extension', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/uploads')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', Buffer.from('fake'), 'test.exe');

    expect(res.status).toBe(400);
  });
});
