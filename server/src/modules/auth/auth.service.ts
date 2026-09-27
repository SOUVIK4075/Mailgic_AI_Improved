import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { UserModel, type UserDoc } from '../../models/User.js';
import { SessionModel } from '../../models/Session.js';
import { conflict, unauthorized, AppError } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { logger } from '../../lib/logger.js';
import type { LoginInput, SignupInput } from './auth.schemas.js';

const BCRYPT_COST = 12;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
// Used when the email doesn't exist, so login takes the same time either way
// (prevents discovering which emails are registered by measuring response time).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

export type IssuedTokens = { accessToken: string; refreshToken: string };

// Short-lived JWT (stateless, checked on every request) + long-lived opaque refresh token
// (stored in the DB, so it can be revoked on logout / password reset).
async function issueTokens(user: UserDoc, userAgent: string): Promise<IssuedTokens> {
  const accessToken = jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
    algorithm: 'HS256',
  });

  const refreshToken = randomToken();
  await SessionModel.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    userAgent: userAgent.slice(0, 200),
  });

  return { accessToken, refreshToken };
}

export async function signup(input: SignupInput, userAgent: string) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const user = await UserModel.create({ name: input.name, email: input.email, passwordHash });
    return { user, tokens: await issueTokens(user, userAgent) };
  } catch (err) {
    // Rely on the unique index instead of "findOne then create", which has a race condition.
    if ((err as { code?: number }).code === 11000) {
      throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}

export async function login(input: LoginInput, userAgent: string) {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');

  return { user, tokens: await issueTokens(user, userAgent) };
}

// Refresh-token rotation: each refresh token works exactly once. The old session is revoked
// atomically and a new one is issued, which limits how long a stolen token stays useful.
export async function refresh(rawToken: string | undefined, userAgent: string) {
  if (!rawToken) throw unauthorized('INVALID_REFRESH_TOKEN', 'Missing refresh token');

  const session = await SessionModel.findOneAndUpdate(
    { tokenHash: sha256(rawToken), revokedAt: null, expiresAt: { $gt: new Date() } },
    { revokedAt: new Date() },
  );
  if (!session) throw unauthorized('INVALID_REFRESH_TOKEN', 'Session expired. Please log in again.');

  const user = await UserModel.findById(session.userId);
  if (!user) throw unauthorized('INVALID_REFRESH_TOKEN', 'Session expired. Please log in again.');

  return { user, tokens: await issueTokens(user, userAgent) };
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  await SessionModel.updateOne({ tokenHash: sha256(rawToken), revokedAt: null }, { revokedAt: new Date() });
}

export async function getUser(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw unauthorized();
  return user;
}

export async function forgotPassword(email: string) {
  const user = await UserModel.findOne({ email });
  // Same response whether or not the account exists (no user enumeration).
  if (!user) return;

  const token = randomToken();
  user.passwordResetTokenHash = sha256(token);
  user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  const link = `${env.APP_URL}/reset-password?token=${token}`;
  try {
    await sendMail(
      user.email,
      'Reset your Mailgic-AI password',
      `Hi ${user.name},\n\nReset your password using this link (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    );
  } catch (err) {
    logger.error({ err }, 'Failed to send password reset email');
  }
}

export async function resetPassword(token: string, newPassword: string) {
  const user = await UserModel.findOne({
    passwordResetTokenHash: sha256(token),
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!user) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  // Log out every device — if the password was reset because of a compromise, old sessions must die.
  await SessionModel.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
}
