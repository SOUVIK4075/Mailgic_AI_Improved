import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import OpenAI from 'openai';
import { AppError } from '../lib/errors.js';

type ErrorBody = { code: string; message: string; details?: unknown };

// Maps every kind of error to one of our standard responses. Anything we don't
// recognise becomes a generic 500 — internal details are logged, never sent to the client.
export function toErrorResponse(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return { status: err.status, body: { code: err.code, message: err.message, details: err.details } };
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return { status: 400, body: { code: 'VALIDATION_ERROR', message: 'Invalid request', details } };
  }
  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, body: { code: 'INVALID_ID', message: `Invalid ${err.path}` } };
  }
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    return { status: 409, body: { code: 'DUPLICATE', message: 'Resource already exists' } };
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return { status: 413, body: { code: 'FILE_TOO_LARGE', message: 'File is too large' } };
    }
    return { status: 400, body: { code: 'UPLOAD_ERROR', message: err.message } };
  }
  if (err instanceof OpenAI.APIError) {
    return { status: 502, body: { code: 'AI_UPSTREAM_ERROR', message: 'The AI provider failed. Please try again.' } };
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return { status: 400, body: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } };
  }
  return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const { status, body } = toErrorResponse(err);
  if (status >= 500) req.log.error({ err }, 'Request failed');
  else req.log.warn({ code: body.code }, body.message);

  res.status(status).json({ error: { ...body, requestId: req.id } });
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`));
}
