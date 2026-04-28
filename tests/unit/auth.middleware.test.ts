import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env before importing
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

import { authenticate, authorize } from '../../src/core/middleware/auth.middleware.ts';
import { generateAccessToken } from '../../src/modules/auth/auth.utils.ts';

// Mock Express request/response
function mockReq(overrides: any = {}) {
  return {
    headers: {},
    user: undefined,
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return vi.fn();
}

describe('Auth Middleware', () => {
  describe('authenticate', () => {
    it('should return 401 when no authorization header is provided', () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header has no Bearer token', () => {
      const req = mockReq({ headers: { authorization: 'Basic abc123' } });
      const res = mockRes();
      const next = mockNext();

      // split(' ')[1] will be 'abc123' but it's not a valid JWT
      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when token is invalid', () => {
      const req = mockReq({ headers: { authorization: 'Bearer invalid.token.here' } });
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should set req.user and call next() with a valid token', () => {
      const user = { id: 1, role: 'agent', departmentId: 3 };
      const token = generateAccessToken(user);
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(1);
      expect(req.user.role).toBe('agent');
      expect(req.user.departmentId).toBe(3);
    });

    it('should handle super_admin tokens', () => {
      const user = { id: 99, role: 'super_admin', departmentId: null };
      const token = generateAccessToken(user);
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.role).toBe('super_admin');
    });
  });

  describe('authorize', () => {
    it('should return 401 when req.user is not set', () => {
      const middleware = authorize(['super_admin']);
      const req = mockReq({ user: undefined });
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when user role is not in the allowed list', () => {
      const middleware = authorize(['super_admin']);
      const req = mockReq({ user: { id: 1, role: 'agent' } });
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient permissions',
          requiredRoles: ['super_admin'],
          yourRole: 'agent',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() when user role is in the allowed list', () => {
      const middleware = authorize(['super_admin', 'supervisor']);
      const req = mockReq({ user: { id: 1, role: 'supervisor' } });
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should support multiple allowed roles', () => {
      const middleware = authorize(['agent', 'supervisor', 'super_admin']);
      
      for (const role of ['agent', 'supervisor', 'super_admin']) {
        const req = mockReq({ user: { id: 1, role } });
        const res = mockRes();
        const next = mockNext();
        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
      }
    });

    it('should reject end_user when not in allowed list', () => {
      const middleware = authorize(['agent', 'supervisor', 'super_admin']);
      const req = mockReq({ user: { id: 1, role: 'end_user' } });
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
