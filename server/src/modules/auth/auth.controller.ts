import type { Request, Response, CookieOptions } from 'express';
import { env, isProd } from '../../config/env.js';
import { ACCESS_COOKIE, currentUser } from '../../middleware/auth.js';
import { toPublicUser } from '../../models/User.js';
import * as authService from './auth.service.js';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from './auth.schemas.js';

const REFRESH_COOKIE = 'refresh_token';

// httpOnly: JavaScript can't read the tokens (protects against XSS token theft).
// sameSite=lax: the browser won't attach them to cross-site POSTs (protects against CSRF).
const baseCookie: CookieOptions = { httpOnly: true, secure: isProd, sameSite: 'lax' };
const refreshTtlMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
// The JWT inside expires after ACCESS_TOKEN_TTL_MINUTES; the cookie itself lives longer on purpose.
// If the browser deleted the cookie at the same moment, the server would see "no token"
// instead of "expired token", and the client wouldn't know it should call /auth/refresh.
const accessCookie: CookieOptions = { ...baseCookie, path: '/', maxAge: refreshTtlMs };
// The refresh token is only ever sent to /api/auth/*, not with every API call.
const refreshCookie: CookieOptions = { ...baseCookie, path: '/api/auth', maxAge: refreshTtlMs };

function setAuthCookies(res: Response, tokens: authService.IssuedTokens) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, accessCookie);
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookie);
}

function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...accessCookie, maxAge: undefined });
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookie, maxAge: undefined });
}

const userAgentOf = (req: Request) => req.get('user-agent') ?? '';

export async function signup(req: Request, res: Response) {
  const input = signupSchema.parse(req.body);
  const { user, tokens } = await authService.signup(input, userAgentOf(req));
  setAuthCookies(res, tokens);
  res.status(201).json({ user: toPublicUser(user) });
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const { user, tokens } = await authService.login(input, userAgentOf(req));
  setAuthCookies(res, tokens);
  res.json({ user: toPublicUser(user) });
}

export async function refresh(req: Request, res: Response) {
  try {
    const { user, tokens } = await authService.refresh(req.cookies?.[REFRESH_COOKIE], userAgentOf(req));
    setAuthCookies(res, tokens);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearAuthCookies(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await authService.getUser(currentUser(req).id);
  res.json({ user: toPublicUser(user) });
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(email);
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, password);
  clearAuthCookies(res);
  res.json({ message: 'Password updated. Please log in with your new password.' });
}
