import type { Request, Response } from 'express';
import { currentUser } from '../../middleware/auth.js';
import { toErrorResponse } from '../../middleware/errorHandler.js';
import { createSse } from '../../lib/sse.js';
import { idParamSchema } from '../../lib/validation.js';
import { getUser } from '../auth/auth.service.js';
import { runOnce } from '../idempotency/idempotency.service.js';
import * as emailsService from './emails.service.js';
import { composeSchema, listEmailsSchema, replySchema, searchEmailsSchema, updateEmailSchema } from './emails.schemas.js';

async function authorOf(req: Request) {
  const user = await getUser(currentUser(req).id);
  return { id: user.id as string, name: user.name };
}

// What makes two requests "the same" for idempotency: who, where, and the validated body.
function idempotencyOf(req: Request, input: unknown) {
  return {
    userId: currentUser(req).id,
    key: req.get('Idempotency-Key'),
    fingerprint: `${req.method} ${req.baseUrl}${req.path} ${JSON.stringify(input)}`,
  };
}

type Generate = (live: emailsService.LiveOptions) => Promise<{ email: Parameters<typeof emailsService.toEmailDTO>[0]; remainingToday: number }>;

// The stored/replayed result is the plain JSON response body.
const toResult = async (generate: Generate, live: emailsService.LiveOptions = {}) => {
  const { email, remainingToday } = await generate(live);
  return { email: emailsService.toEmailDTO(email), usage: { remainingToday } };
};

async function respondJson(req: Request, res: Response, input: unknown, generate: Generate) {
  const { result, replayed } = await runOnce(idempotencyOf(req, input), () => toResult(generate));
  if (replayed) res.set('Idempotent-Replayed', 'true');
  res.status(201).json(result);
}

/**
 * Same work as respondJson, but streamed as Server-Sent Events:
 *   analysis (reply only) → draft, draft, draft… → done   (or → error)
 * If the client disconnects (Stop button / closed tab) we abort the AI call; the service then
 * refunds the quota slot and saves nothing, and idempotency drops the key so it can be retried.
 */
async function respondStream(req: Request, res: Response, input: unknown, generate: Generate) {
  const sse = createSse(res);
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  // The model sends many tiny pieces; forward at most one "draft" event every 50 ms.
  // (The final text always arrives in "done", so skipping intermediate snapshots is safe.)
  let lastDraftAt = 0;
  const live: emailsService.LiveOptions = {
    signal: abort.signal,
    onAnalysis: (analysis) => sse.send('analysis', { analysis }),
    onDraft: (draft) => {
      const now = Date.now();
      if (now - lastDraftAt < 50) return;
      lastDraftAt = now;
      sse.send('draft', draft);
    },
  };

  try {
    const { result } = await runOnce(idempotencyOf(req, input), () => toResult(generate, live));
    sse.send('done', result);
    sse.end();
  } catch (err) {
    if (abort.signal.aborted) {
      req.log.info('Draft cancelled by the client');
      return;
    }
    if (!sse.started) throw err; // nothing streamed yet → normal JSON error via errorHandler
    const { status, body } = toErrorResponse(err);
    if (status >= 500) req.log.error({ err }, 'Streaming draft failed');
    sse.send('error', body);
    sse.end();
  }
}

export async function compose(req: Request, res: Response) {
  const input = composeSchema.parse(req.body);
  const author = await authorOf(req);
  await respondJson(req, res, input, (live) => emailsService.compose(author, input, live));
}

export async function composeStream(req: Request, res: Response) {
  const input = composeSchema.parse(req.body);
  const author = await authorOf(req);
  await respondStream(req, res, input, (live) => emailsService.compose(author, input, live));
}

export async function reply(req: Request, res: Response) {
  const input = replySchema.parse(req.body);
  const author = await authorOf(req);
  await respondJson(req, res, input, (live) => emailsService.reply(author, input, live));
}

export async function replyStream(req: Request, res: Response) {
  const input = replySchema.parse(req.body);
  const author = await authorOf(req);
  await respondStream(req, res, input, (live) => emailsService.reply(author, input, live));
}

export async function list(req: Request, res: Response) {
  const query = listEmailsSchema.parse(req.query);
  const { items, nextCursor } = await emailsService.list(currentUser(req).id, query);
  res.json({ items: items.map(emailsService.toEmailDTO), nextCursor });
}

export async function search(req: Request, res: Response) {
  const { q, limit } = searchEmailsSchema.parse(req.query);
  const results = await emailsService.search(currentUser(req).id, q, limit);
  res.json({ items: results.map((r) => ({ ...emailsService.toEmailDTO(r.email), matchedBy: r.matchedBy })) });
}

export async function getOne(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const email = await emailsService.getById(currentUser(req).id, id);
  res.json({ email: emailsService.toEmailDTO(email) });
}

export async function update(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const input = updateEmailSchema.parse(req.body);
  const email = await emailsService.update(currentUser(req).id, id, input);
  res.json({ email: emailsService.toEmailDTO(email) });
}

export async function remove(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  await emailsService.remove(currentUser(req).id, id);
  res.status(204).end();
}

export async function clearAll(req: Request, res: Response) {
  const deletedCount = await emailsService.clearAll(currentUser(req).id);
  res.json({ deletedCount });
}
