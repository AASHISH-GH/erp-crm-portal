import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/apiError';
import { isProduction } from '../config/env';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

const mapPrismaError = (error: Prisma.PrismaClientKnownRequestError): ApiError => {
  switch (error.code) {
    case 'P2002': {
      const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return ApiError.conflict(`A record with this ${target} already exists`, { target });
    }
    case 'P2003':
      return ApiError.badRequest('Referenced record does not exist');
    case 'P2025':
      return ApiError.notFound('Record not found');
    default:
      return new ApiError(500, 'Database error', 'DATABASE_ERROR');
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    apiError = mapPrismaError(error);
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    apiError = ApiError.badRequest('Invalid data supplied to the database layer');
  } else if (error instanceof SyntaxError && 'body' in error) {
    apiError = ApiError.badRequest('Request body is not valid JSON');
  } else {
    apiError = new ApiError(500, 'Something went wrong', 'INTERNAL_SERVER_ERROR');
  }

  if (apiError.statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', error);
  }

  res.status(apiError.statusCode).json({
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      ...(!isProduction && error instanceof Error && apiError.statusCode >= 500
        ? { stack: error.stack }
        : {}),
    },
  });
};
