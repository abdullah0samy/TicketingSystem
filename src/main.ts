import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import * as express from 'express';

async function bootstrap() {
  // CRITICAL: Fail fast if JWT secrets are not configured
  const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
  const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
  if (!ACCESS_SECRET || !REFRESH_SECRET) {
    console.error('🔴 CRITICAL: JWT secrets must be configured via environment variables!');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // BigInt serialization fix — same as Express app
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  // Helmet security headers (matching Express app.ts config exactly)
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
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'same-origin' },
  }));

  // CORS (matching Express app.ts config)
  const corsOrigins = process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Body parser limit matching Express
  app.use(morgan('dev'));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Swagger / OpenAPI docs (disabled in production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ABCH Hospital Help Desk API')
      .setDescription('NestJS API for ABCH Hospital Ticketing CRM')
      .setVersion('2.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const PORT = Number(process.env.NEST_PORT) || 4000;
  await app.listen(PORT, '0.0.0.0');
  console.log(`🏥 NestJS backend running on http://localhost:${PORT}`);
}
bootstrap();
