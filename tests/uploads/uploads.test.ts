import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import { superAdminToken } from '../../tests/helpers/auth-helpers.ts';

vi.mock('../../src/core/db.ts', () => {
  const m = () => ({ update: vi.fn().mockResolvedValue({ id: 1, avatarUrl: '/uploads/avatars/resized-test.png' }) });
  return {
    default: {
      user: m(),
      $disconnect: vi.fn(),
    },
    prisma: {} as any,
  };
});

vi.mock('../../src/core/paths.ts', () => ({
  UPLOADS_DIR: '/tmp/uploads',
  AVATARS_DIR: '/tmp/uploads/avatars',
  EXPORTS_DIR: '/tmp/uploads/exports',
  ensureDirectories: vi.fn(),
}));

vi.mock('../../src/core/socket.ts', () => ({
  emitToDept: vi.fn(),
  emitToUser: vi.fn(),
  emitToTicket: vi.fn(),
  getIO: vi.fn(() => ({ to: vi.fn().mockReturnValue({ emit: vi.fn() }) })),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined),
  })),
}));

let app: any;

beforeAll(async () => {
  const mod = await import('../../src/app.ts');
  app = mod.default;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/uploads — file upload', () => {
  it('returns 400 when no file uploaded', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(400);
  });

  it('handles multer errors for invalid file type', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .attach('file', Buffer.from('fake content'), {
        filename: 'test.exe',
        contentType: 'application/x-msdownload',
      });

    expect(res.status).toBe(500);
  });
});

describe('GET /api/uploads/download/:filename — file download', () => {
  it('returns 404 for non-existent file', async () => {
    const res = await request(app)
      .get('/api/uploads/download/nonexistent.pdf')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(404);
  });

  it('path.basename sanitization prevents directory traversal', async () => {
    const res = await request(app)
      .get('/api/uploads/download/../../../etc/passwd')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/users/avatar — avatar upload', () => {
  it('returns 400 when no file uploaded', async () => {
    const res = await request(app)
      .put('/api/users/avatar')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(400);
  });
});
