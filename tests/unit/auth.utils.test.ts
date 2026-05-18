import { describe, it, expect, beforeAll } from 'vitest';

// Set env before importing modules
process.env.JWT_ACCESS_SECRET = 'test-access-secret';

import {
  generateAccessToken,
  verifyAccessToken,
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
      expect(token.split('.')).toHaveLength(3);
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

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const token = generateAccessToken(mockUser);
      const decoded = verifyAccessToken(token) as any;
      expect(decoded.id).toBe(1);
    });

    it('should throw for an invalid token', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow();
    });

    it('should throw for a tampered token', () => {
      const token = generateAccessToken(mockUser);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      expect(() => verifyAccessToken(tamperedToken)).toThrow();
    });
  });
});
