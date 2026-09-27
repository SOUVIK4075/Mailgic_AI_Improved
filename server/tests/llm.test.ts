import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import OpenAI from 'openai';

const create = vi.hoisted(() => vi.fn());
vi.mock('../src/modules/ai/openai.js', () => ({ openai: { chat: { completions: { create } } } }));

import { generateStructured, streamStructured } from '../src/modules/ai/llm.js';

const schema = z.object({ subject: z.string(), body: z.string() });
const request = { model: 'm', schemaName: 'email', schema, system: 's', user: 'u', maxTokens: 100 };

const completion = (content: string | null, finish_reason = 'stop') => ({
  model: 'm',
  usage: { prompt_tokens: 10, completion_tokens: 5 },
  choices: [{ finish_reason, message: { content, refusal: null } }],
});

beforeEach(() => {
  create.mockReset();
});

describe('generateStructured', () => {
  it('sends the Zod schema as a strict JSON schema and returns validated data', async () => {
    create.mockResolvedValue(completion(JSON.stringify({ subject: 'Hi', body: 'Hello' })));
    const res = await generateStructured(request);

    expect(res.data).toEqual({ subject: 'Hi', body: 'Hello' });
    const sent = create.mock.calls[0]![0];
    expect(sent.response_format.json_schema).toMatchObject({ strict: true, schema: { required: ['subject', 'body'] } });
  });

  it('retries once when the model returns JSON of the wrong shape, and sums token usage', async () => {
    create
      .mockResolvedValueOnce(completion(JSON.stringify({ subject: 'Hi' })))
      .mockResolvedValueOnce(completion(JSON.stringify({ subject: 'Hi', body: 'Hello' })));
    const res = await generateStructured(request);

    expect(create).toHaveBeenCalledTimes(2);
    expect(res.usage).toEqual({ promptTokens: 20, completionTokens: 10 });
  });

  it('switches to the fallback model when the provider is overloaded (503/429)', async () => {
    create
      .mockRejectedValueOnce(new OpenAI.APIError(503, undefined, 'overloaded', new Headers()))
      .mockResolvedValueOnce(completion(JSON.stringify({ subject: 'Hi', body: 'Hello' })));
    const res = await generateStructured(request);

    expect(res.data.subject).toBe('Hi');
    expect(create.mock.calls.map((c) => c[0].model)).toEqual(['m', 'fallback-model']);
    // Primary fails fast (no SDK retries); the fallback keeps the normal retries.
    expect(create.mock.calls.map((c) => c[1]?.maxRetries)).toEqual([0, undefined]);
  });

  it('does not use the fallback for client errors like a bad request (400)', async () => {
    create.mockRejectedValue(new OpenAI.APIError(400, undefined, 'bad request', new Headers()));
    await expect(generateStructured(request)).rejects.toBeInstanceOf(OpenAI.APIError);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('treats a truncated response as invalid and fails with 502 after retrying', async () => {
    create.mockResolvedValue(completion('{"subject": "Hi", "bo', 'length'));
    await expect(generateStructured(request)).rejects.toMatchObject({ status: 502, code: 'AI_INVALID_RESPONSE' });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('streamStructured', () => {
  // A fake SDK stream: yields the given text pieces, stops early if the signal is aborted
  // (that's how the real SDK behaves — it ends the stream instead of throwing).
  function fakeStream(pieces: string[], onPiece?: (i: number) => void, signal?: AbortSignal) {
    return (async function* () {
      for (const [i, content] of pieces.entries()) {
        if (signal?.aborted) return;
        onPiece?.(i);
        yield { model: 'm', usage: { prompt_tokens: 5, completion_tokens: i + 1 }, choices: [{ delta: { content }, finish_reason: null }] };
      }
    })();
  }

  it('passes the text so far to onText and returns validated data', async () => {
    create.mockImplementation(async () => fakeStream(['{"subject": "Hi", ', '"body": "Hello"}']));
    const seen: string[] = [];
    const res = await streamStructured(request, { onText: (t) => seen.push(t) });
    expect(seen).toEqual(['{"subject": "Hi", ', '{"subject": "Hi", "body": "Hello"}']);
    expect(res.data).toEqual({ subject: 'Hi', body: 'Hello' });
  });

  it('throws an abort error on cancel instead of retrying without streaming', async () => {
    const ctrl = new AbortController();
    create.mockImplementation(async (_params: unknown, opts: { signal?: AbortSignal }) =>
      fakeStream(['{"subject": "Hi", ', '"body": "Hel', 'lo"}'], (i) => i === 1 && ctrl.abort(), opts.signal),
    );
    await expect(streamStructured(request, { signal: ctrl.signal, onText: () => {} })).rejects.toBeInstanceOf(OpenAI.APIUserAbortError);
    expect(create).toHaveBeenCalledTimes(1); // no second (non-streamed) call, no fallback model
  });
});
