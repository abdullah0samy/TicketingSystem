import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env before importing
process.env.NODE_ENV = 'test';

// Manually mock the validate and validateQuery functions to test them in isolation
import { validate, validateQuery } from '../../src/core/utils/api.utils.ts';
import { z } from 'zod';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return vi.fn();
}

describe('API Utils - Validation Middleware', () => {
  describe('validate (body)', () => {
    const testSchema = z.object({
      name: z.string().min(2),
      age: z.number().min(0),
    });

    it('should pass valid body data through and call next()', async () => {
      const middleware = validate(testSchema);
      const req = { body: { name: 'John', age: 25 } } as any;
      const res = mockRes();
      const next = mockNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.body.name).toBe('John');
      expect(req.body.age).toBe(25);
    });

    it('should return 400 for invalid body data', async () => {
      const middleware = validate(testSchema);
      const req = { body: { name: 'J', age: -5 } } as any;
      const res = mockRes();
      const next = mockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Validation failed' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 with structured error paths', async () => {
      const middleware = validate(testSchema);
      const req = { body: {} } as any;
      const res = mockRes();
      const next = mockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const callArgs = res.json.mock.calls[0][0];
      expect(callArgs.errors).toBeDefined();
      expect(Array.isArray(callArgs.errors)).toBe(true);
      expect(callArgs.errors.length).toBeGreaterThan(0);
    });

    it('should replace req.body with validated (transformed) data', async () => {
      const schemaWithDefault = z.object({
        name: z.string(),
        status: z.string().default('active'),
      });
      const middleware = validate(schemaWithDefault);
      const req = { body: { name: 'Test' } } as any;
      const res = mockRes();
      const next = mockNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.status).toBe('active');
    });
  });

  describe('validateQuery', () => {
    const querySchema = z.object({
      page: z.string().regex(/^\d+$/).transform(Number).optional(),
      search: z.string().min(1).optional(),
    });

    it('should pass valid query params through and call next()', async () => {
      const middleware = validateQuery(querySchema);
      const req = { query: { page: '5', search: 'hello' } } as any;
      const res = mockRes();
      const next = mockNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.query.page).toBe(5); // transformed to number
    });

    it('should return 400 for invalid query params', async () => {
      const middleware = validateQuery(querySchema);
      const req = { query: { page: 'abc' } } as any;
      const res = mockRes();
      const next = mockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid query parameters' })
      );
    });
  });
});
