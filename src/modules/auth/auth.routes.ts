import express from 'express';
import bcrypt from 'bcrypt';
import csrf from 'csurf';

import { PrismaClient } from '@prisma/client';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from './auth.utils.ts';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
      connectionLimit: 20,
      poolTimeout: 30,
      connectTimeout: 10
    }
  }
});

const router = express.Router();
const csrfProtection = csrf({ cookie: true });

router.use((req, res, next) => {
  res.cookie('XSRF-TOKEN', req.csrfToken());
  next();
router.post('/login', csrfProtection, async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: 'ID and password are required' });
  }

  // BUG FIX: Cap password length to prevent bcrypt DoS (bcrypt truncates at 72 bytes anyway)
  if (typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ message: 'Invalid password format' });
  }

  // Ensure identifier is safe (alphanumeric for username or numeric for badge)
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

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid credentials or inactive account' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Set refreshToken as httpOnly cookie for secure persistence
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        badgeNumber: user.badgeNumber,
        username: user.username,
        fullNameAr: user.fullNameAr,
        fullNameEn: user.fullNameEn,
        role: user.role,
        department: user.department
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/refresh', csrfProtection, async (req, res) => {
  // BUG FIX: Also accept refreshToken from httpOnly cookie
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;

  }

  try {
    const decoded = verifyRefreshToken(refreshToken) as any;
    
    // BUG FIX: Verify decoded.id is valid before querying
    if (!decoded || !decoded.id) {
      return res.status(403).json({ message: 'Invalid refresh token payload' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid refresh token or inactive account' });
    }

    const newAccessToken = generateAccessToken(user);
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
});

router.post('/logout', csrfProtection, (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
});

export default router;
