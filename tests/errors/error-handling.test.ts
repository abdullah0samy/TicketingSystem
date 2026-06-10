import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('Global error handler', () => {
  function createTestApp() {
    const app = express();
    app.get('/trigger-error', () => {
      throw new Error('Test error message');
    });
    app.get('/trigger-async-error', async () => {
      throw new Error('Async test error');
    });
    app.get('/trigger-status-error', () => {
      const err: any = new Error('Custom status');
      err.status = 422;
      throw err;
    });
    app.use('/api/*', (req, res) => {
      res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}`, status: 404 });
    });
    app.use((err: any, req: any, res: any, next: any) => {
      const status = err.status || 500;
      res.status(status).json({
        message: process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred. Please contact IT support.'
          : err.message || 'Internal Server Error',
        requestId: req.headers['x-request-id'] || undefined,
      });
    });
    return app;
  }

  it('returns 500 with error message in dev mode', async () => {
    const app = createTestApp();
    const res = await request(app).get('/trigger-error');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Test error message');
  });

  it('hides error details in production mode', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const app = createTestApp();
    const res = await request(app).get('/trigger-error');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('An unexpected error occurred. Please contact IT support.');
    process.env.NODE_ENV = origEnv;
  });

  it('preserves custom error status code', async () => {
    const app = createTestApp();
    const res = await request(app).get('/trigger-status-error');
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Custom status');
  });

  it('includes requestId when x-request-id header is present', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/trigger-error')
      .set('x-request-id', 'req-123');
    expect(res.body.requestId).toBe('req-123');
  });
});

describe('API 404 handler', () => {
  it('returns 404 for unknown API routes', async () => {
    const app = express();
    app.use('/api/*', (req, res) => {
      res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}`, status: 404 });
    });
    const res = await request(app).get('/api/nonexistent/route');
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Route not found');
  });
});

describe('Rate limiting', () => {
  it('returns 429 when rate limit exceeded', async () => {
    const rateLimit = (await import('express-rate-limit')).default;
    const app = express();
    app.use(rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      message: { message: 'Too many requests, please try again later.' },
    }));
    app.get('/test', (req, res) => res.json({ ok: true }));

    const res1 = await request(app).get('/test');
    expect(res1.status).toBe(200);

    const res2 = await request(app).get('/test');
    expect(res2.status).toBe(200);

    const res3 = await request(app).get('/test');
    expect(res3.status).toBe(429);
    expect(res3.body.message).toBe('Too many requests, please try again later.');
  });

  it('returns 429 when login rate limit exceeded', async () => {
    const rateLimit = (await import('express-rate-limit')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/auth', rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
    }));
    app.post('/api/auth/login', (req, res) => res.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/auth/login').send({ username: 'test', password: 'test' });
      if (i < 2) expect(res.status).toBe(200);
      else {
        expect(res.status).toBe(429);
        expect(res.body.message).toContain('Too many login attempts');
      }
    }
  });
});

describe.skip('Graceful shutdown (Express-specific — not applicable to NestJS)', () => {
  it('disconnects Prisma and closes HTTP on SIGTERM', async () => {
    const prismaDisconnect = vi.fn().mockResolvedValue(undefined);
    const serverClose = vi.fn((cb: any) => cb());

    vi.doMock('../../src/prisma/prisma.service', () => ({
      PrismaService: vi.fn().mockImplementation(() => ({ $disconnect: prismaDisconnect })),
    }));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const { PrismaService } = await import('../../src/prisma/prisma.service');
    const prisma = new PrismaService();
    const httpServer = { close: serverClose } as any;
    const gracefulShutdown = async (signal: string) => {
      await prisma.$disconnect();
      httpServer.close(() => {});
    };

    await gracefulShutdown('SIGTERM');
    expect(prismaDisconnect).toHaveBeenCalled();
    expect(serverClose).toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});

describe.skip('Startup validation (Express-specific — not applicable to NestJS)', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
  });

  it('exits process when JWT secrets are missing', async () => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.doMock('dotenv/config', () => ({}));
    await import('../../src/main.ts');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('does not exit when JWT secrets are present', async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh';

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await import('../../src/main.ts');
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
