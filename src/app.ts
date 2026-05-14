import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';

// Fix BigInt serialization for JSON.stringify
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import prisma from './core/db.ts';
import { UPLOADS_DIR, AVATARS_DIR } from './core/paths.ts';
import fs from 'fs';

// Ensure upload directories exist
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!ACCESS_SECRET || !REFRESH_SECRET) {
  console.error('🔴 CRITICAL: JWT secrets must be configured via environment variables!...');
  process.exit(1);
}

// Validate required environment variables for production
if (process.env.NODE_ENV === 'production') {
  const required = ['DATABASE_URL', 'FRONTEND_URL'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`🔴 CRITICAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  const port = parseInt(process.env.PORT || '3000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error('🔴 CRITICAL: Invalid PORT');
    process.exit(1);
  }
}

// Modules
import authRoutes from './modules/auth/auth.routes.ts';
import userRoutes from './modules/users/users.routes.ts';
import adminRoutes from './modules/admin/admin.routes.ts';
import ticketRoutes from './modules/tickets/tickets.routes.ts';
import analyticsRoutes from './modules/analytics/analytics.routes.ts';
import uploadRoutes from './modules/uploads/uploads.routes.ts';
import assetRoutes from './modules/assets/assets.routes.ts';
import knowledgeRoutes from './modules/knowledge/knowledge.routes.ts';
import teamNoteRoutes from './modules/team-notes/team-notes.routes.ts';

import auditRoutes from './modules/audit/audit.routes.ts';
import profileRoutes from './modules/profile/profile.routes.ts';
import { requestLogger } from './core/middleware/request_logger.ts';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './core/swagger.ts';

const app = express();

// Global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 2000 : 1000000, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/api/health' || req.path === '/api/test-bigint'
});

// Auth
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 50 : 1000000, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' }
});

// Analytics (env-configurable, default 300 per 15min)
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_ANALYTICS || '300', 10),
  message: { message: 'Analytics rate limit exceeded. Please wait a few minutes.' }
});

// Search (env-configurable, default 60 per min)
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_SEARCH || '60', 10),
  message: { message: 'Too many search requests. Please slow down.' }
});

// Uploads (env-configurable, default 100 per hour)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_UPLOAD || '100', 10),
  message: { message: 'Upload limit reached. Please try again later.' }
});

// SECURITY FIX: Configure CORS to restrict to trusted origins
const corsOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
  : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

// Security & Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // Vite handles inline scripts with proper nonces
      styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind requires this
      imgSrc: ["'self'", "data:", "blob:", "https://*"],
      connectSrc: ["'self'", "ws:", "wss:", process.env.FRONTEND_URL || "https://yourdomain.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false,
}));
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use('/api/', globalLimiter, requestLogger);

// Serve static files from uploads
app.use('/uploads', express.static(UPLOADS_DIR));

const serverStartTime = Date.now();

// API Health Check
app.get('/api/health', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const mem = process.memoryUsage();
    res.json({
      status: 'ok',
      service: 'ABCH Ticketing System API',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      database: 'connected',
      memory: {
        used: Math.round(mem.heapUsed / 1024 / 1024),
        total: Math.round(mem.heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      responseTime: `${Date.now() - start}ms`
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/test-bigint', (req, res) => {
  res.json({
    message: 'Testing BigInt serialization',
    value: BigInt(9007199254740991) + BigInt(1)
  });
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'ABCH API Docs',
  customfavIcon: '/favicon.ico',
}));

// API Routes
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tickets', ticketRoutes);
// Search rate limiter must be mounted BEFORE ticketRoutes or inside the router
// Moved inside tickets.routes.ts as middleware on the search route
app.use('/api/analytics', analyticsLimiter, analyticsRoutes);
app.use('/api/uploads', uploadLimiter, uploadRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/team-notes', teamNoteRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/audit', auditRoutes);

// API 404 Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    message: `API Route not found: ${req.originalUrl}`,
    status: 404
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: any) => {
  // Log full error for server logs
  console.error('Unhandled Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';

  res.status(status).json({
    message: isProd && status === 500 
      ? 'An unexpected error occurred. Please contact IT support.' 
      : err.message || 'Internal Server Error',
    error: isProd ? {} : err, // Never expose details in production
    requestId: req.headers['x-request-id'] || undefined
  });
});

export default app;
