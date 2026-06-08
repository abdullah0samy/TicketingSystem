import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Standardized Zod validation helper for Express routes
 */
export const validate = (schema: z.ZodSchema) => async (req: any, res: Response, next: NextFunction) => {
  try {
    const validatedData = await schema.parseAsync(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: error.issues.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
    }
    next(error);
  }
};

/**
 * Validates query parameters
 */
export const validateQuery = (schema: z.ZodSchema) => async (req: any, res: Response, next: NextFunction) => {
  try {
    const validatedQuery = await schema.parseAsync(req.query);
    req.query = validatedQuery as any;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Invalid query parameters',
        errors: error.issues.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
    }
    next(error);
  }
};
