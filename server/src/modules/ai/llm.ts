import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { openai } from './openai.js';

export type TokenUsage = { promptTokens: number; completionTokens: number };

export type StructuredResult<T> = {
  data: T;
  usage: TokenUsage;
  model: string;
  latencyMs: number;
};

type StructuredRequest<S extends z.ZodType> = {
  model: string;
  /** Internal: how many times the SDK retries 429/5xx. Set by withFallback. */
  maxRetries?: number;
  schemaName: string;
  schema: S;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
};

const MAX_ATTEMPTS = 2;

/**
 * Ask the model for JSON matching a Zod schema.
 *
 * 1. The Zod schema is converted to JSON Schema and sent as `response_format` (strict mode),
 *    so the model is constrained to produce that exact shape.
 * 2. We still validate the reply with Zod — never trust external input, even from an LLM.
 * 3. If the reply is cut off or invalid, we retry once before giving up with a 502.
 * 4. If the model itself is unavailable, we switch to OPENAI_FALLBACK_MODEL (if configured).
 */
export async function generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
  return withFallback(req, callModel);
}

// Model fallback: if the provider is overloaded or rate-limited (429 / 5xx, after the SDK's own
// retries), try once more on a different model instead of failing the user's request.
async function withFallback<S extends z.ZodType, R>(req: StructuredRequest<S>, run: (req: StructuredRequest<S>) => Promise<R>): Promise<R> {
  const fallback = env.OPENAI_FALLBACK_MODEL;
  const canFallBack = Boolean(fallback) && fallback !== req.model;
  try {
    // Fail fast: when a fallback exists, don't spend ~10 s on backoff retries of an overloaded or
    // rate-limited model (a free-tier quota error won't fix itself in a second). Switch instead.
    return await run(canFallBack ? { ...req, maxRetries: 0 } : req);
  } catch (err) {
    if (err instanceof OpenAI.APIUserAbortError) throw err; // user cancelled — don't try another model
    const status = err instanceof OpenAI.APIError ? err.status : undefined;
    const overloaded = status === 429 || (status !== undefined && status >= 500);
    if (!overloaded || !canFallBack) throw err;

    logger.warn({ model: req.model, fallback, status }, 'AI model unavailable, using fallback');
    return run({ ...req, model: fallback! });
  }
}

const toJsonSchema = (schema: z.ZodType) => {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  return jsonSchema;
};

// Settings shared by the normal and the streaming call.
const baseParams = <S extends z.ZodType>(req: StructuredRequest<S>) => ({
  model: req.model,
  temperature: req.temperature ?? 0.7,
  max_completion_tokens: req.maxTokens,
  ...(env.OPENAI_REASONING_EFFORT && { reasoning_effort: env.OPENAI_REASONING_EFFORT }),
  messages: [
    { role: 'system' as const, content: req.system },
    { role: 'user' as const, content: req.user },
  ],
  response_format: {
    type: 'json_schema' as const,
    json_schema: { name: req.schemaName, schema: toJsonSchema(req.schema), strict: true },
  },
});

async function callModel<S extends z.ZodType>(req: StructuredRequest<S>, signal?: AbortSignal): Promise<StructuredResult<z.infer<S>>> {
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  const started = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const completion = await openai.chat.completions.create(baseParams(req), { maxRetries: req.maxRetries, signal });

    usage.promptTokens += completion.usage?.prompt_tokens ?? 0;
    usage.completionTokens += completion.usage?.completion_tokens ?? 0;

    const choice = completion.choices[0];
    if (choice?.message.refusal) {
      throw new AppError(422, 'AI_REFUSED', 'The AI declined this request. Please rephrase it.');
    }

    const parsed = choice?.finish_reason === 'length' ? null : safeJson(choice?.message.content);
    const result = req.schema.safeParse(parsed);
    if (result.success) {
      return { data: result.data, usage, model: completion.model, latencyMs: Date.now() - started };
    }

    logger.warn({ attempt, schema: req.schemaName, finishReason: choice?.finish_reason }, 'Invalid structured AI response');
  }

  throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI returned an unexpected response. Please try again.');
}

export type StreamOptions = {
  signal?: AbortSignal;
  /** Called with the full raw text received so far, every time a new piece arrives. */
  onText: (textSoFar: string) => void;
};

/**
 * Streaming version of generateStructured: the model's JSON arrives in small pieces, and we pass
 * the text-so-far to `onText` so the caller can show the email being written.
 *
 * - `signal` lets the caller cancel (user pressed Stop / closed the tab): the HTTP request to the
 *   AI provider is aborted, so we stop paying for tokens nobody will read.
 * - The complete text is validated with Zod at the end, exactly like the non-streaming version.
 *   If it's invalid we fall back to one normal (non-streamed) attempt.
 */
export async function streamStructured<S extends z.ZodType>(
  req: StructuredRequest<S>,
  opts: StreamOptions,
): Promise<StructuredResult<z.infer<S>>> {
  return withFallback(req, (r) => callModelStreaming(r, opts));
}

async function callModelStreaming<S extends z.ZodType>(req: StructuredRequest<S>, opts: StreamOptions): Promise<StructuredResult<z.infer<S>>> {
  const started = Date.now();
  const stream = await openai.chat.completions.create(
    { ...baseParams(req), stream: true, stream_options: { include_usage: true } },
    { signal: opts.signal, maxRetries: req.maxRetries },
  );

  let text = '';
  let finishReason: string | null = null;
  let model = req.model;
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };

  for await (const chunk of stream) {
    model = chunk.model || model;
    // Some providers send usage on every chunk (running total), others only on the last one.
    if (chunk.usage) {
      usage.promptTokens = chunk.usage.prompt_tokens;
      usage.completionTokens = chunk.usage.completion_tokens;
    }
    const choice = chunk.choices[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const piece = choice?.delta?.content;
    if (piece) {
      text += piece;
      opts.onText(text);
    }
  }

  // When the signal fires, the SDK simply ends the stream instead of throwing. Without this check
  // the half-finished JSON would look "invalid" and we'd start a brand-new request below.
  if (opts.signal?.aborted) throw new OpenAI.APIUserAbortError();

  const result = req.schema.safeParse(finishReason === 'length' ? null : safeJson(text));
  if (result.success) return { data: result.data, usage, model, latencyMs: Date.now() - started };

  logger.warn({ schema: req.schemaName, finishReason }, 'Invalid streamed AI response, retrying without streaming');
  const retry = await callModel(req, opts.signal);
  return {
    ...retry,
    usage: { promptTokens: usage.promptTokens + retry.usage.promptTokens, completionTokens: usage.completionTokens + retry.usage.completionTokens },
    latencyMs: Date.now() - started,
  };
}

function safeJson(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
