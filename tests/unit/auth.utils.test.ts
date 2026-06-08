import { describe, it, expect, beforeAll } from 'vitest';

// Set env before importing modules
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/modules/auth/auth.utils.ts';

describe('Auth Utils - Token Generation & Verification', () => {
  const mockUser = {
    id: 1,
    role: 'agent',
    departmentId: 5,
  };

  describe('generateAccessToken', () => {
    it('should generate a valid JWT string', () => {
      const token = generateAccessToken(mockUser);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should encode user id, role, and departmentId in the payload', () => {
      const token = generateAccessToken(mockUser);
      const decoded = verifyAccessToken(token) as any;
      expect(decoded.id).toBe(1);
      expect(decoded.role).toBe('agent');
      expect(decoded.departmentId).toBe(5);
    });

    it('should handle null departmentId (e.g., end_user)', () => {
      const endUser = { id: 2, role: 'end_user', departmentId: null };
      const token = generateAccessToken(endUser);
      const decoded = verifyAccessToken(token) as any;
      expect(decoded.id).toBe(2);
      expect(decoded.role).toBe('end_user');
      expect(decoded.departmentId).toBeNull();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid JWT string', () => {
      const token = generateRefreshToken(mockUser);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should only encode user id in the payload', () => {
      const token = generateRefreshToken(mockUser);
      const decoded = verifyRefreshToken(token) as any;
      expect(decoded.id).toBe(1);
      // Refresh token should NOT contain role or departmentId
      expect(decoded.role).toBeUndefined();
      expect(decoded.departmentId).toBeUndefined();
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const token = generateAccessToken(mockUser);
      const decoded = verifyAccessToken(token) as any;
      expect(decoded.id).toBe(1);
    });

    it('should throw for an invalid token', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow();
    });

    it('should throw for a token signed with wrong secret', () => {
      // Generate a token, then try to verify with a differ env
      const token = generateAccessToken(mockUser);
      // Tamper with the token
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      expect(() => verifyAccessToken(tamperedToken)).toThrow();
    });

    it('should NOT accept a refresh token as access token', () => {
      const refreshToken = generateRefreshToken(mockUser);
      // Refresh tokens are signed with REFRESH_SECRET, verifyAccessToken uses ACCESS_SECRET
      expect(() => verifyAccessToken(refreshToken)).toThrow();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const token = generateRefreshToken(mockUser);
      const decoded = verifyRefreshToken(token) as any;
      expect(decoded.id).toBe(1);
    });

    it('should throw for an invalid token', () => {
      expect(() => verifyRefreshToken('garbage')).toThrow();
    });

    it('should NOT accept an access token as refresh token', () => {
      const accessToken = generateAccessToken(mockUser);
      // Access tokens are signed with ACCESS_SECRET, verifyRefreshToken uses REFRESH_SECRET
      expect(() => verifyRefreshToken(accessToken)).toThrow();
    });
  });
});
