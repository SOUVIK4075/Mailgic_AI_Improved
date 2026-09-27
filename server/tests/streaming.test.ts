import { beforeEach, describe, expect, it, vi } from 'vitest';
import type request from 'supertest';

const llm = vi.hoisted(() => ({ generateStructured: vi.fn(), streamStructured: vi.fn() }));
vi.mock('../src/modules/ai/llm.js', () => llm);
vi.mock('../src/modules/ai/retrieval.js', () => ({ retrieveRelevantChunks: vi.fn(async () => []) }));

import { signedInAgent } from './helpers.js';
import { UsageModel } from '../src/models/Usage.js';
import { readPartialString } from '../src/modules/ai/partialJson.js';

const EMAIL = { subject: 'Thanks for today', body: 'Hi Rahul,\n\nThank you for meeting.', placeholders: [] };
const aiResult = (data: unknown) => ({ data, usage: { promptTokens: 10, completionTokens: 5 }, model: 'm', latencyMs: 5 });
const composeBody = { type: 'follow-up', tone: 'professional', prompt: 'Thank the client for the meeting today' };

// supertest doesn't buffer text/event-stream by default; collect it and split into events.
const collectText = (res: request.Response, cb: (err: Error | null, body: string) => void) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => (data += chunk));
  res.on('end', () => cb(null, data));
};
function parseSse(text: string) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}

beforeEach(() => {
  llm.generateStructured.mockReset().mockResolvedValue(aiResult(EMAIL));
  // Pretend the model sends the JSON in three pieces.
  llm.streamStructured.mockReset().mockImplementation(async (_req, opts: { onText: (t: string) => void }) => {
    const full = JSON.stringify(EMAIL);
    for (const cut of [20, 45, full.length]) opts.onText(full.slice(0, cut));
    return aiResult(EMAIL);
  });
});

describe('Idempotency-Key', () => {
  it('replays the stored result for the same key instead of calling the AI again', async () => {
    const { agent, user } = await signedInAgent();
    const first = await agent.post('/api/emails/compose').set('Idempotency-Key', 'key-abc-123').send(composeBody).expect(201);
    const again = await agent.post('/api/emails/compose').set('Idempotency-Key', 'key-abc-123').send(composeBody).expect(201);

    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.email.id).toBe(first.body.email.id);
    expect(llm.generateStructured).toHaveBeenCalledTimes(1);
    expect((await UsageModel.findOne({ userId: user.id }))!.requests).toBe(1); // charged once
  });

  it('rejects reusing a key for a different request', async () => {
    const { agent } = await signedInAgent();
    await agent.post('/api/emails/compose').set('Idempotency-Key', 'key-abc-123').send(composeBody).expect(201);
    const res = await agent
      .post('/api/emails/compose')
      .set('Idempotency-Key', 'key-abc-123')
      .send({ ...composeBody, prompt: 'Something completely different' })
      .expect(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('does not store failures, so the same key can be retried', async () => {
    const { agent } = await signedInAgent();
    llm.generateStructured.mockRejectedValueOnce(new Error('provider down'));
    await agent.post('/api/emails/compose').set('Idempotency-Key', 'key-retry-1').send(composeBody).expect(500);
    await agent.post('/api/emails/compose').set('Idempotency-Key', 'key-retry-1').send(composeBody).expect(201);
    expect(llm.generateStructured).toHaveBeenCalledTimes(2);
  });

  it('answers 409 while the first request with that key is still running', async () => {
    const { agent } = await signedInAgent();
    let finish!: () => void;
    llm.generateStructured.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve(aiResult(EMAIL)))));

    const slow = agent.post('/api/emails/compose').set('Idempotency-Key', 'key-slow-1').send(composeBody).then((r) => r);
    await vi.waitFor(() => expect(llm.generateStructured).toHaveBeenCalled());
    const res = await agent.post('/api/emails/compose').set('Idempotency-Key', 'key-slow-1').send(composeBody).expect(409);
    expect(res.body.error.code).toBe('REQUEST_IN_PROGRESS');

    finish();
    expect((await slow).status).toBe(201);
  });

  it('validates the key format', async () => {
    const { agent } = await signedInAgent();
    const res = await agent.post('/api/emails/compose').set('Idempotency-Key', 'no spaces!').send(composeBody).expect(400);
    expect(res.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });
});

describe('POST /api/emails/compose/stream', () => {
  it('streams draft snapshots, then a done event with the saved email', async () => {
    const { agent } = await signedInAgent();
    const res = await agent.post('/api/emails/compose/stream').send(composeBody).buffer(true).parse(collectText).expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseSse(res.body as string);
    expect(events[0]).toMatchObject({ event: 'draft' });
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { email: { subject: 'Thanks for today' }, usage: { remainingToday: 2 } } });
  });

  it('returns normal JSON errors for problems before streaming starts', async () => {
    const { agent } = await signedInAgent();
    const res = await agent.post('/api/emails/compose/stream').send({ ...composeBody, tone: 'evil' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sends an error event if generation fails midway, and refunds the quota', async () => {
    const { agent, user } = await signedInAgent();
    llm.streamStructured.mockImplementationOnce(async (_req, opts: { onText: (t: string) => void }) => {
      opts.onText('{"subject": "Hi", "body": "Dear');
      throw new Error('connection reset');
    });
    const res = await agent.post('/api/emails/compose/stream').send(composeBody).buffer(true).parse(collectText).expect(200);

    const events = parseSse(res.body as string);
    expect(events.at(-1)).toMatchObject({ event: 'error', data: { code: 'INTERNAL_ERROR' } });
    expect((await UsageModel.findOne({ userId: user.id }))!.requests).toBe(0);
  });

  it('replays a completed stream as a single done event', async () => {
    const { agent } = await signedInAgent();
    const send = () =>
      agent.post('/api/emails/compose/stream').set('Idempotency-Key', 'stream-key-1').send(composeBody).buffer(true).parse(collectText);
    await send().expect(200);
    const events = parseSse((await send().expect(200)).body as string);

    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe('done');
    expect(llm.streamStructured).toHaveBeenCalledTimes(1);
  });

  it('reply stream sends the analysis before the draft', async () => {
    llm.generateStructured.mockResolvedValueOnce(
      aiResult({ senderName: 'Priya', summary: 's', intent: 'i', questions: [], requestedActions: [], deadlines: [], sentiment: 'neutral' }),
    );
    const { agent } = await signedInAgent();
    const res = await agent
      .post('/api/emails/reply/stream')
      .send({ incomingEmail: 'Hi, can we get a refund please? Thanks, Priya', tone: 'friendly' })
      .buffer(true)
      .parse(collectText)
      .expect(200);

    const names = parseSse(res.body as string).map((e) => e.event);
    expect(names[0]).toBe('analysis');
    expect(names.at(-1)).toBe('done');
  });
});

describe('readPartialString', () => {
  it('reads a string field from incomplete JSON, decoding escapes', () => {
    expect(readPartialString('{"subject": "Hi", "body": "Dear Ra', 'body')).toBe('Dear Ra');
    expect(readPartialString('{"body": "Line 1\\nSay \\"hi\\" caf\\u00e9"}', 'body')).toBe('Line 1\nSay "hi" café');
    expect(readPartialString('{"subject": "Hi"', 'body')).toBe('');
    expect(readPartialString('{"body": "cut in half \\', 'body')).toBe('cut in half ');
  });
});
