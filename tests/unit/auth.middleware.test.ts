import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { generateAccessToken } from '../../src/modules/auth/auth.utils';
import { Reflector } from '@nestjs/core';

function mockExecutionContext(req: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('should throw 401 when no authorization header is provided', () => {
    const context = mockExecutionContext({ headers: {} });
    expect(() => guard.canActivate(context)).toThrow('Unauthorized');
  });

  it('should throw 403 when token is invalid', () => {
    const context = mockExecutionContext({ headers: { authorization: 'Bearer invalid.token.here' } });
    expect(() => guard.canActivate(context)).toThrow('Forbidden or expired token');
  });

  it('should set req.user and return true with a valid token', () => {
    const req = { headers: {} } as any;
    const user = { id: 1, role: 'agent', departmentId: 3 };
    const token = generateAccessToken(user);
    req.headers.authorization = `Bearer ${token}`;
    const context = mockExecutionContext(req);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(1);
    expect(req.user.role).toBe('agent');
    expect(req.user.departmentId).toBe(3);
  });

  it('should handle super_admin tokens', () => {
    const req = { headers: {} } as any;
    const user = { id: 99, role: 'super_admin', departmentId: null };
    const token = generateAccessToken(user);
    req.headers.authorization = `Bearer ${token}`;
    const context = mockExecutionContext(req);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.user.role).toBe('super_admin');
  });
});

describe('RolesGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('should throw 403 when req.user is not set', () => {
    const guard = new RolesGuard(reflector);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin']);
    const context = mockExecutionContext({});
    expect(() => guard.canActivate(context)).toThrow('Unauthorized');
  });

  it('should throw 403 when user role is not in the allowed list', () => {
    const guard = new RolesGuard(reflector);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin']);
    const context = mockExecutionContext({ user: { id: 1, role: 'agent' } });
    expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
  });

  it('should return true when user role is in the allowed list', () => {
    const guard = new RolesGuard(reflector);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin', 'supervisor']);
    const context = mockExecutionContext({ user: { id: 1, role: 'supervisor' } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should support multiple allowed roles', () => {
    const guard = new RolesGuard(reflector);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['agent', 'supervisor', 'super_admin']);

    for (const role of ['agent', 'supervisor', 'super_admin']) {
      const context = mockExecutionContext({ user: { id: 1, role } });
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('should reject end_user when not in allowed list', () => {
    const guard = new RolesGuard(reflector);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['agent', 'supervisor', 'super_admin']);
    const context = mockExecutionContext({ user: { id: 1, role: 'end_user' } });
    expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
  });
});
