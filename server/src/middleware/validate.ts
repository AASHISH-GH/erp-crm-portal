import type { NextFunction, Request, Response } from 'express';
import { ZodError, type AnyZodObject, type ZodTypeAny } from 'zod';
import { ApiError } from '../lib/apiError';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

const formatZodError = (error: ZodError) =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

/**
 * Validates and *replaces* req.body/query/params with the parsed result, so handlers
 * downstream work with coerced, trimmed, fully typed values instead of raw strings.
 */
export const validate =
  (schemas: ValidationSchemas) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        // Express 5 makes req.query a getter; assign defensively for forward compatibility.
        Object.defineProperty(req, 'query', { value: parsedQuery, writable: true });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(ApiError.badRequest('Validation failed', formatZodError(error)));
        return;
      }
      next(error);
    }
  };
