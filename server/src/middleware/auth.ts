import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const ACCESS_COOKIE = 'access_token';

type AccessTokenPayload = { sub: string; role: 'user' | 'admin' };

// Authentication: "who are you?" — verifies the short-lived access token cookie.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return next(unauthorized());

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    // The client uses TOKEN_EXPIRED as the signal to call /auth/refresh and retry.
    if (err instanceof jwt.TokenExpiredError) return next(unauthorized('TOKEN_EXPIRED', 'Access token expired'));
    next(unauthorized('UNAUTHENTICATED', 'Invalid access token'));
  }
}

// Authorization: "are you allowed to do this?" — must run after requireAuth.
export function requireRole(role: 'admin') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return next(forbidden());
    next();
  };
}

// Small helper so controllers get a non-null user without repeating checks.
export function currentUser(req: Request) {
  if (!req.user) throw unauthorized();
  return req.user;
}
