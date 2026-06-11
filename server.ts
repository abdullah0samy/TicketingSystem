import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { DIST_DIR } from './src/core/paths';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function startServer() {
  const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
  const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
  if (!ACCESS_SECRET || !REFRESH_SECRET) {
    console.error('CRITICAL: JWT secrets must be configured via environment variables!');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance() as express.Application;

  const PORT = Number(process.env.NEST_PORT) || Number(process.env.PORT) || 3000;

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://*"],
        connectSrc: ["'self'", "ws:", "wss:", process.env.FRONTEND_URL || 'https://yourdomain.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: process.env.NODE_ENV === 'production' ? {
      maxAge: 31536000, includeSubDomains: true, preload: true,
    } : false,
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'same-origin' },
  }));

  const corsOrigins = process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(morgan('dev'));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  if (process.env.NODE_ENV !== 'production') {
    expressApp.use((await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })).middlewares);
  } else {
    expressApp.use(express.static(DIST_DIR));
    expressApp.get('*', (_req: any, res: any) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  await app.listen(PORT, '0.0.0.0');
  console.log(`ABCH Ticketing System running on http://localhost:${PORT}`);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
