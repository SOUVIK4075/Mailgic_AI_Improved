import { env } from '../../config/env.js';
import { tooManyRequests } from '../../lib/errors.js';
import { UsageModel } from '../../models/Usage.js';
import type { TokenUsage } from '../ai/llm.js';

export const todayUTC = () => new Date().toISOString().slice(0, 10);

/**
 * Reserve one AI request from today's budget, atomically.
 *
 * The filter only matches while `requests < limit`. When the limit is reached the filter
 * matches nothing, so the upsert tries to INSERT a second doc for the same (userId, date) —
 * the unique index rejects it with error 11000, which we translate to DAILY_QUOTA_EXCEEDED.
 * This is race-free: two parallel requests can never both take the last slot.
 */
export async function reserveRequest(userId: string): Promise<{ remainingToday: number }> {
  const limit = env.DAILY_AI_REQUEST_LIMIT;
  try {
    const usage = await UsageModel.findOneAndUpdate(
      { userId, date: todayUTC(), requests: { $lt: limit } },
      { $inc: { requests: 1 } },
      { upsert: true, new: true },
    );
    return { remainingToday: Math.max(0, limit - usage.requests) };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw tooManyRequests('DAILY_QUOTA_EXCEEDED', `Daily limit of ${limit} AI requests reached. Try again tomorrow.`);
    }
    throw err;
  }
}

// Give the slot back if the AI call failed, so users aren't charged for our errors.
export async function releaseRequest(userId: string) {
  await UsageModel.updateOne({ userId, date: todayUTC(), requests: { $gt: 0 } }, { $inc: { requests: -1 } });
}

export async function recordTokens(userId: string, usage: TokenUsage) {
  await UsageModel.updateOne(
    { userId, date: todayUTC() },
    { $inc: { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens } },
  );
}

export async function getTodayUsage(userId: string) {
  const usage = await UsageModel.findOne({ userId, date: todayUTC() }).lean();
  return {
    today: {
      requests: usage?.requests ?? 0,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
    },
    dailyLimit: env.DAILY_AI_REQUEST_LIMIT,
  };
}
