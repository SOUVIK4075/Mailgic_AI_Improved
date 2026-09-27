import { Types, type FilterQuery } from 'mongoose';
import { env } from '../../config/env.js';
import { notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { EmailModel, EMAIL_VECTOR_INDEX_NAME, type Email, type EmailDoc } from '../../models/Email.js';
import { embedQuery, embedTexts } from '../ai/embeddings.js';
import { generateStructured, streamStructured, type TokenUsage } from '../ai/llm.js';
import { readPartialString } from '../ai/partialJson.js';
import type { ReplyAnalysis } from '../ai/prompts.js';
import { retrieveRelevantChunks, type RetrievedChunk } from '../ai/retrieval.js';
import {
  buildComposePrompt,
  buildReplyAnalysisPrompt,
  buildReplyDraftPrompt,
  emailOutputSchema,
  replyAnalysisSchema,
} from '../ai/prompts.js';
import * as usageService from '../usage/usage.service.js';
import type { ComposeInput, ListEmailsInput, ReplyInput, UpdateEmailInput } from './emails.schemas.js';

type Author = { id: string; name: string };

/** Optional hooks used by the streaming endpoints. Without them, generation is a single normal call. */
export type LiveOptions = {
  signal?: AbortSignal;
  onDraft?: (draft: { subject: string; body: string }) => void;
  onAnalysis?: (analysis: ReplyAnalysis) => void;
};

// Picks the streaming or the normal LLM call. When streaming, the half-written JSON is turned into
// { subject, body } so the user sees the email appear word by word.
function writeEmail(request: Parameters<typeof generateStructured<typeof emailOutputSchema>>[0], live: LiveOptions) {
  const { onDraft } = live;
  if (!onDraft) return generateStructured(request);
  return streamStructured(request, {
    signal: live.signal,
    onText: (text) => onDraft({ subject: readPartialString(text, 'subject'), body: readPartialString(text, 'body') }),
  });
}

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  promptTokens: a.promptTokens + b.promptTokens,
  completionTokens: a.completionTokens + b.completionTokens,
});

// Output budget: roughly 2 tokens per word plus room for the JSON wrapper.
const maxTokensFor = (words: number | null) => (words ? words * 2 + 300 : 1200);

const toSources = (chunks: RetrievedChunk[]) =>
  chunks.map((c) => ({
    documentId: c.documentId,
    title: c.title,
    chunkIndex: c.chunkIndex,
    score: Number(c.score.toFixed(3)),
    excerpt: c.text.slice(0, 200),
  }));

/**
 * Wraps an AI operation with the daily quota: reserve a slot first, give it back if the
 * operation throws, record token usage if it succeeds.
 */
async function withQuota<T extends { usage: TokenUsage }>(userId: string, op: () => Promise<T>) {
  const { remainingToday } = await usageService.reserveRequest(userId);
  try {
    const result = await op();
    await usageService.recordTokens(userId, result.usage);
    return { result, remainingToday };
  } catch (err) {
    await usageService.releaseRequest(userId);
    throw err;
  }
}

export async function compose(author: Author, input: ComposeInput, live: LiveOptions = {}) {
  const words = input.length.option === 'custom' ? input.length.words : null;

  const { result, remainingToday } = await withQuota(author.id, async () => {
    const knowledge = input.useKnowledge ? await retrieveRelevantChunks(author.id, input.prompt) : [];
    const prompt = buildComposePrompt({ ...input, words, senderName: author.name, knowledge });
    const ai = await writeEmail(
      { model: env.OPENAI_CHAT_MODEL, schemaName: 'email', schema: emailOutputSchema, ...prompt, maxTokens: maxTokensFor(words) },
      live,
    );
    return { ...ai, knowledge };
  });

  const email = await EmailModel.create({
    userId: author.id,
    mode: 'compose',
    type: input.type,
    tone: input.tone,
    prompt: input.prompt,
    ...result.data,
    sources: toSources(result.knowledge),
    wordCount: countWords(result.data.body),
    ai: { model: result.model, latencyMs: result.latencyMs, ...result.usage },
  });

  return { email, remainingToday };
}

/**
 * Reply flow = two focused LLM calls instead of one big one:
 *   1. A cheap/fast model extracts structure (questions, deadlines, intent) from the email.
 *   2. We search the knowledge base using that summary + questions (a cleaner query than raw email text).
 *   3. The main model writes the reply, with an explicit checklist of questions to answer.
 */
export async function reply(author: Author, input: ReplyInput, live: LiveOptions = {}) {
  const { result, remainingToday } = await withQuota(author.id, async () => {
    const analysis = await generateStructured({
      model: env.OPENAI_FAST_MODEL,
      schemaName: 'reply_analysis',
      schema: replyAnalysisSchema,
      ...buildReplyAnalysisPrompt(input.incomingEmail),
      maxTokens: 600,
      temperature: 0,
    });

    live.onAnalysis?.(analysis.data);

    const searchQuery = [analysis.data.summary, ...analysis.data.questions, input.instructions].join('\n');
    const knowledge = input.useKnowledge ? await retrieveRelevantChunks(author.id, searchQuery) : [];

    const draft = await writeEmail(
      {
        model: env.OPENAI_CHAT_MODEL,
        schemaName: 'email',
        schema: emailOutputSchema,
        ...buildReplyDraftPrompt({ ...input, analysis: analysis.data, senderName: author.name, knowledge }),
        maxTokens: maxTokensFor(null),
      },
      live,
    );

    return {
      analysis: analysis.data,
      draft: draft.data,
      knowledge,
      model: draft.model,
      latencyMs: analysis.latencyMs + draft.latencyMs,
      usage: addUsage(analysis.usage, draft.usage),
    };
  });

  const email = await EmailModel.create({
    userId: author.id,
    mode: 'reply',
    tone: input.tone,
    prompt: input.instructions,
    incomingEmail: input.incomingEmail,
    analysis: result.analysis,
    ...result.draft,
    sources: toSources(result.knowledge),
    wordCount: countWords(result.draft.body),
    ai: { model: result.model, latencyMs: result.latencyMs, ...result.usage },
  });

  return { email, remainingToday };
}

/**
 * Cursor pagination: "give me `limit` emails older than `cursor`".
 * Unlike skip/offset it stays fast on page 1000 (it's an index seek, not a scan)
 * and doesn't show duplicates when new emails are created while the user scrolls.
 */
export async function list(userId: string, q: ListEmailsInput) {
  const filter: FilterQuery<Email> = { userId };
  if (q.mode) filter.mode = q.mode;
  if (q.type) filter.type = q.type;
  if (q.cursor) filter._id = { $lt: q.cursor };

  // Fetch one extra row to know whether another page exists.
  const rows = await EmailModel.find(filter).sort({ _id: -1 }).limit(q.limit + 1);
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;

  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

// Authorization by ownership: every query includes userId, so one user can never
// read or delete another user's email. We return 404 (not 403) to avoid revealing it exists.
export async function getById(userId: string, id: string) {
  const email = await EmailModel.findOne({ _id: id, userId });
  if (!email) throw notFound('Email');
  return email;
}

// Saves the user's final (edited) version. getById enforces ownership, so this can't touch others' emails.
export async function update(userId: string, id: string, input: UpdateEmailInput) {
  const email = await getById(userId, id);
  if (input.subject !== undefined) email.subject = input.subject;
  if (input.body !== undefined) {
    email.body = input.body;
    email.wordCount = countWords(input.body);
  }
  if (input.recipient !== undefined) email.recipient = input.recipient;
  // Placeholders the user filled in are no longer in the text; keep only the ones still there.
  email.placeholders = email.placeholders.filter((p) => email.subject.includes(p) || email.body.includes(p));
  email.finalizedAt = new Date();
  email.embeddedAt = null; // text changed: the indexing job will re-embed it for search
  await email.save();
  return email;
}

export async function remove(userId: string, id: string) {
  const { deletedCount } = await EmailModel.deleteOne({ _id: id, userId });
  if (deletedCount === 0) throw notFound('Email');
}

export async function clearAll(userId: string) {
  const { deletedCount } = await EmailModel.deleteMany({ userId });
  return deletedCount;
}

// ---------- Search: keyword + meaning, merged with Reciprocal Rank Fusion ----------

const RRF_K = 60; // standard constant; dampens the gap between rank 1 and rank 2
// Similarity scores are relative: with our embedding model even unrelated emails score ~0.72, and
// good matches ~0.75–0.82 — a fixed cut-off can't separate them. So we keep only matches close
// to the best one (within MEANING_MARGIN), plus an absolute floor for "nothing is really similar".
const MEANING_FLOOR = 0.7;
const MEANING_MARGIN = 0.015;

type RankedList = { name: 'keyword' | 'meaning'; ids: string[] };

/**
 * Reciprocal Rank Fusion: an item's score is the sum of 1 / (K + rank) over every list it appears in.
 * It only needs *ranks*, so we can merge text-search scores and vector scores even though they are
 * on completely different scales. Items found by both searches naturally rise to the top.
 */
export function reciprocalRankFusion(lists: RankedList[]) {
  const scores = new Map<string, { score: number; matchedBy: RankedList['name'][] }>();
  for (const list of lists) {
    list.ids.forEach((id, rank) => {
      const entry = scores.get(id) ?? { score: 0, matchedBy: [] };
      entry.score += 1 / (RRF_K + rank + 1);
      entry.matchedBy.push(list.name);
      scores.set(id, entry);
    });
  }
  return [...scores.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.score - a.score);
}

async function keywordSearch(userId: string, q: string, limit: number): Promise<string[]> {
  const rows = await EmailModel.find({ userId, $text: { $search: q } }, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .select('_id')
    .lean();
  return rows.map((r) => String(r._id));
}

async function meaningSearch(userId: string, q: string, limit: number): Promise<string[]> {
  // Nothing indexed yet for this user? Skip the embedding API call entirely.
  if (!(await EmailModel.exists({ userId, embeddedAt: { $ne: null } }))) return [];
  try {
    const rows = await EmailModel.aggregate<{ _id: Types.ObjectId; score: number }>([
      {
        $vectorSearch: {
          index: EMAIL_VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector: await embedQuery(q),
          numCandidates: limit * 10,
          limit,
          filter: { userId: new Types.ObjectId(userId) },
        },
      },
      { $project: { _id: 1, score: { $meta: 'vectorSearchScore' } } },
    ]);
    const best = rows[0]?.score ?? 0;
    return rows.filter((r) => r.score >= MEANING_FLOOR && r.score >= best - MEANING_MARGIN).map((r) => String(r._id));
  } catch (err) {
    // Plain MongoDB (no Atlas Search) or embedding API down: keyword results still work.
    logger.warn({ err: (err as Error).message }, 'Meaning search failed — returning keyword results only');
    return [];
  }
}

export async function search(userId: string, q: string, limit: number) {
  // Both searches run in parallel; each returns a few extra so fusion has something to merge.
  const [keyword, meaning] = await Promise.all([keywordSearch(userId, q, limit * 2), meaningSearch(userId, q, limit * 2)]);
  const ranked = reciprocalRankFusion([
    { name: 'keyword', ids: keyword },
    { name: 'meaning', ids: meaning },
  ]).slice(0, limit);

  const docs = await EmailModel.find({ userId, _id: { $in: ranked.map((r) => r.id) } });
  const byId = new Map(docs.map((d) => [d.id as string, d]));
  return ranked.flatMap((r) => {
    const doc = byId.get(r.id);
    return doc ? [{ email: doc, matchedBy: r.matchedBy }] : [];
  });
}

/**
 * Background job: embed up to `batchSize` emails that aren't indexed yet (new, edited, or created
 * before search existed — so old emails get backfilled automatically). One batched API call.
 * The update filter includes `updatedAt`, so if the user edited the email meanwhile we don't
 * overwrite the flag with an embedding of the old text (optimistic concurrency).
 */
export async function indexPendingEmails(batchSize = 20): Promise<boolean> {
  const pending = await EmailModel.find({ embeddedAt: null }).sort({ _id: 1 }).limit(batchSize).select('subject body updatedAt');
  if (pending.length === 0) return false;

  const { vectors } = await embedTexts(pending.map((e) => `${e.subject}\n\n${e.body}`));
  await EmailModel.bulkWrite(
    pending.map((e, i) => ({
      updateOne: {
        filter: { _id: e._id, updatedAt: e.updatedAt },
        update: { $set: { embedding: vectors[i], embeddedAt: new Date() } },
        timestamps: false,
      },
    })),
  );
  logger.debug({ count: pending.length }, 'Emails indexed for search');
  return true;
}

export function toEmailDTO(email: EmailDoc) {
  return {
    id: email.id as string,
    mode: email.mode,
    type: email.type ?? null,
    tone: email.tone,
    prompt: email.prompt ?? '',
    incomingEmail: email.incomingEmail ?? null,
    analysis: email.analysis ?? null,
    subject: email.subject,
    body: email.body,
    placeholders: email.placeholders,
    sources: email.sources.map((s) => ({
      documentId: String(s.documentId),
      title: s.title,
      chunkIndex: s.chunkIndex,
      score: s.score,
      excerpt: s.excerpt,
    })),
    wordCount: email.wordCount,
    recipient: email.recipient ?? null,
    finalizedAt: email.finalizedAt ?? null,
    createdAt: email.createdAt,
  };
}
