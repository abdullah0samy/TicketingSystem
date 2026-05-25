import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

import prisma from '../../core/db.ts';
import { generateAccessToken } from './auth.utils.ts';
import { generateToken } from '../../core/middleware/csrf.middleware.ts';

const router = express.Router();

const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Strict per-IP rate limiter for login only (not shared with /refresh or /logout)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 1000000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown'
});

router.post('/login', loginLimiter, async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: 'ID and password are required' });
  }

  if (typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ message: 'Invalid password format' });
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(identifier)) {
    return res.status(400).json({ message: 'Invalid identifier format' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { badgeNumber: identifier },
          { username: identifier }
        ]
      },
      include: { department: true }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // SECURITY: Check account lockout (DB-persisted, survives restarts)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({
        message: `Account temporarily locked. Try again in ${remaining} minute(s).`,
        code: 'ACCOUNT_LOCKED'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Invalid credentials or inactive account' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const newCount = user.failedLoginAttempts + 1;

      if (newCount >= MAX_FAILED_ATTEMPTS) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: newCount,
            lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS)
          }
        });
        return res.status(429).json({
          message: `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MS / 60000} minutes.`,
          code: 'ACCOUNT_LOCKED'
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: newCount }
      });

      const remaining = MAX_FAILED_ATTEMPTS - newCount;
      return res.status(401).json({
        message: `Invalid credentials. ${remaining} attempt(s) remaining.`,
        attemptsRemaining: remaining
      });
    }

    // Successful login — reset lockout counters
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: req.ip || req.socket.remoteAddress || null,
      }
    });

    const refreshTokenValue = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash,
        refreshTokenExpiresAt: expiresAt,
      }
    });

    const accessToken = generateAccessToken(user);

    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshTokenValue, REFRESH_TOKEN_COOKIE_OPTIONS);

    const csrfToken = generateToken(req, res);

    res.json({
      accessToken,
      csrfToken,
      user: {
        id: user.id,
        badgeNumber: user.badgeNumber,
        username: user.username,
        fullNameAr: user.fullNameAr,
        fullNameEn: user.fullNameEn,
        role: user.role,
        department: user.department,
        forcePasswordChange: user.forcePasswordChange,
      }
    });
  } catch (error: any) {
    console.error('🔴 Login error:', error?.message || error, error?.stack ? error.stack.slice(0, 500) : '');
    res.status(500).json({ message: 'Internal server error', detail: process.env.NODE_ENV !== 'production' ? error?.message : undefined });
  }
});

router.post('/refresh', async (req, res) => {
  const refreshTokenValue = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  if (!refreshTokenValue) {
    return res.status(401).json({ message: 'Refresh token required' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');

    const storedUser = await prisma.user.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        refreshTokenExpiresAt: { gt: new Date() },
        isActive: true,
      },
    });

    if (!storedUser) {
      res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_OPTIONS);
      return res.status(403).json({ message: 'Invalid or expired refresh token' });
    }

    const newRefreshTokenValue = crypto.randomBytes(40).toString('hex');
    const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshTokenValue).digest('hex');
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: storedUser.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        refreshTokenExpiresAt: newExpiresAt,
      }
    });

    const newAccessToken = generateAccessToken(storedUser);

    res.cookie(REFRESH_TOKEN_COOKIE_NAME, newRefreshTokenValue, REFRESH_TOKEN_COOKIE_OPTIONS);

    const csrfToken = generateToken(req, res);
    res.json({ accessToken: newAccessToken, csrfToken });
  } catch (error) {
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_OPTIONS);
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
});

router.post('/logout', async (req, res) => {
  const refreshTokenValue = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  if (refreshTokenValue) {
    const tokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
    await prisma.user.updateMany({
      where: { refreshTokenHash: tokenHash },
      data: { refreshTokenHash: null, refreshTokenExpiresAt: null }
    }).catch(() => {});
  }

  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_OPTIONS);
  res.json({ message: 'Logged out' });
});

export default router;
