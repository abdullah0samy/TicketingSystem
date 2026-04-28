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
import path from 'path';
import fs from 'fs';

// Ensure upload directories exist
const uploadDir = path.join(process.cwd(), 'uploads/avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
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
import { requestLogger } from './core/middleware/request_logger.ts';

const app = express();

// Global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000000 : 2000, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' }
});

// Auth
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000000 : 50, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' }
});

// Analytics
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000000 : 100,
  message: { message: 'Analytics rate limit exceeded. Please wait a few minutes.' }
});

// Search
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000000 : 20,
  message: { message: 'Too many search requests. Please slow down.' }
});

// Uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000000 : 30,
  message: { message: 'Upload limit reached. Please try again later.' }
});

// Security & Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for Vite/Motion
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://*"], // allow external assets
      connectSrc: ["'self'", "ws:", "wss:", "https://*"], // allow sockets and external apis
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use('/api/', globalLimiter, requestLogger);

// Serve static files from uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// API Health Check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    // Test DB connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      service: 'ABCH Ticketing System API',
      database: 'connected',
      timestamp: new Date().toISOString()
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

// API Routes
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/tickets/search', searchLimiter); // Extra protection for search
app.use('/api/analytics', analyticsLimiter, analyticsRoutes);
app.use('/api/uploads', uploadLimiter, uploadRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/team-notes', teamNoteRoutes);
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
