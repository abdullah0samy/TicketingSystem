import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../../modules/auth/auth.utils.ts';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    role: string;
    departmentId?: number | null;
    fullNameEn?: string;
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 'TOKEN_MISSING', message: 'Authorization token required' });
  }

  try {
    const decoded = verifyAccessToken(token) as any;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Access token expired' });
    }
    return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Invalid access token' });
  }
};

export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ code: 'TOKEN_MISSING', message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        requiredRoles: roles,
        yourRole: req.user.role
      });
    }
    next();
  };
};
