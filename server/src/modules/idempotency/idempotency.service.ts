import crypto from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import { IdempotencyKeyModel } from '../../models/IdempotencyKey.js';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyRequest = {
  userId: string;
  key: string | undefined; // value of the Idempotency-Key header (optional)
  fingerprint: string; // method + path + validated body — what makes two requests "the same"
};

/**
 * Run `operation` at most once per (user, Idempotency-Key).
 *
 * 1. Try to INSERT a "processing" record. The unique index on (userId, key) makes this atomic:
 *    if two identical requests arrive together, only one insert succeeds.
 * 2. Winner: runs the operation, stores the result as "completed".
 *    If it fails, the record is deleted so the client can simply retry with the same key.
 * 3. Loser / later retry: gets the stored result back (replayed), or 409 if the first one is still
 *    running, or 422 if the key was reused for a different request.
 */
export async function runOnce<T>(req: IdempotencyRequest, operation: () => Promise<T>): Promise<{ result: T; replayed: boolean }> {
  if (req.key === undefined) return { result: await operation(), replayed: false };
  if (!KEY_PATTERN.test(req.key)) {
    throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8–100 letters, digits, "-" or "_"');
  }

  const requestHash = crypto.createHash('sha256').update(req.fingerprint).digest('hex');
  const filter = { userId: req.userId, key: req.key };

  try {
    await IdempotencyKeyModel.create({ ...filter, requestHash, expiresAt: new Date(Date.now() + TTL_MS) });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;

    const existing = await IdempotencyKeyModel.findOne(filter).lean();
    if (!existing) throw new AppError(409, 'REQUEST_IN_PROGRESS', 'This request is already being processed');
    if (existing.requestHash !== requestHash) {
      throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request');
    }
    if (existing.status === 'processing') {
      throw new AppError(409, 'REQUEST_IN_PROGRESS', 'This request is already being processed');
    }
    return { result: existing.response as T, replayed: true };
  }

  try {
    const result = await operation();
    await IdempotencyKeyModel.updateOne(filter, { status: 'completed', response: result });
    return { result, replayed: false };
  } catch (err) {
    await IdempotencyKeyModel.deleteOne(filter); // failed or cancelled: nothing to replay, allow a retry
    throw err;
  }
}
