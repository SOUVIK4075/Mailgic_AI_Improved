import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { tooManyRequests } from '../lib/errors.js';

// In-memory store: correct for a single server instance. If we ever run several instances,
// swap in a shared store (e.g. Redis) — that is the only reason Redis would be added.
const common = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
};

// Slows down password guessing / account-creation spam. Keyed by IP.
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  handler: (_req, _res, next) =>
    next(tooManyRequests('RATE_LIMITED', 'Too many attempts. Please try again in a few minutes.')),
});

// Burst protection on expensive AI endpoints. Keyed by user (falls back to IP).
// The per-day budget is enforced separately by usage.service (DAILY_QUOTA_EXCEEDED).
export const aiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  handler: (_req, _res, next) =>
    next(tooManyRequests('RATE_LIMITED', 'You are sending requests too quickly. Please wait a minute.')),
});

// Search embeds the query (a small API call), so it gets its own, looser limit.
export const searchLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  handler: (_req, _res, next) => next(tooManyRequests('RATE_LIMITED', 'Too many searches. Please wait a moment.')),
});
