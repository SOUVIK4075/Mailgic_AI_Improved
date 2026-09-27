import { beforeEach, describe, expect, it, vi } from 'vitest';

// The LLM is mocked: tests must be fast, free and deterministic.
const llm = vi.hoisted(() => ({ generateStructured: vi.fn() }));
vi.mock('../src/modules/ai/llm.js', () => llm);
vi.mock('../src/modules/ai/retrieval.js', () => ({ retrieveRelevantChunks: vi.fn(async () => []) }));

import { app, signedInAgent } from './helpers.js';
import request from 'supertest';
import { EmailModel } from '../src/models/Email.js';
import { UsageModel } from '../src/models/Usage.js';
import { retrieveRelevantChunks } from '../src/modules/ai/retrieval.js';

const aiResult = (data: unknown) => ({
  data,
  usage: { promptTokens: 100, completionTokens: 50 },
  model: 'test-model',
  latencyMs: 10,
});

const composeBody = {
  type: 'follow-up',
  tone: 'professional',
  prompt: 'Thank the client for the meeting and confirm next steps',
  length: { option: 'custom', words: 120 },
};

beforeEach(() => {
  llm.generateStructured.mockReset();
  llm.generateStructured.mockResolvedValue(
    aiResult({ subject: 'Thanks for today', body: 'Hi [Client Name],\n\nThank you for meeting.', placeholders: ['[Client Name]'] }),
  );
});

describe('POST /api/emails/compose', () => {
  it('requires authentication', async () => {
    await request(app).post('/api/emails/compose').send(composeBody).expect(401);
  });

  it('generates, stores and returns a structured email', async () => {
    const { agent, user } = await signedInAgent({ name: 'Souvik' });
    const res = await agent.post('/api/emails/compose').send(composeBody).expect(201);

    expect(res.body.email).toMatchObject({
      mode: 'compose',
      type: 'follow-up',
      subject: 'Thanks for today',
      placeholders: ['[Client Name]'],
      wordCount: 7,
    });
    expect(res.body.usage.remainingToday).toBe(2);

    // The prompt includes the user's name for the sign-off and the requested length.
    const call = llm.generateStructured.mock.calls[0]![0];
    expect(call.system).toContain('Sign the email as "Souvik"');
    expect(call.system).toContain('about 120 words');

    const saved = await EmailModel.findById(res.body.email.id);
    expect(String(saved!.userId)).toBe(user.id);
    expect(saved!.ai).toMatchObject({ promptTokens: 100, completionTokens: 50 });
  });

  it('validates type, tone, prompt length and word count', async () => {
    const { agent } = await signedInAgent();
    const res = await agent
      .post('/api/emails/compose')
      .send({ type: 'hacking', tone: 'evil', prompt: 'hi', length: { option: 'custom', words: 5000 } })
      .expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['type', 'tone', 'prompt', 'length.words']));
    expect(llm.generateStructured).not.toHaveBeenCalled();
  });

  it('only searches the knowledge base when asked to', async () => {
    const { agent } = await signedInAgent();
    await agent.post('/api/emails/compose').send(composeBody).expect(201);
    expect(retrieveRelevantChunks).not.toHaveBeenCalled();

    await agent.post('/api/emails/compose').send({ ...composeBody, useKnowledge: true }).expect(201);
    expect(retrieveRelevantChunks).toHaveBeenCalledTimes(1);
  });

  it('enforces the daily quota and refunds requests that fail', async () => {
    const { agent, user } = await signedInAgent();

    llm.generateStructured.mockRejectedValueOnce(new Error('provider down'));
    await agent.post('/api/emails/compose').send(composeBody).expect(500);
    expect((await UsageModel.findOne({ userId: user.id }))!.requests).toBe(0); // refunded

    for (let i = 0; i < 3; i++) await agent.post('/api/emails/compose').send(composeBody).expect(201);
    const res = await agent.post('/api/emails/compose').send(composeBody).expect(429);
    expect(res.body.error.code).toBe('DAILY_QUOTA_EXCEEDED');
  });
});

describe('POST /api/emails/reply', () => {
  it('analyses the incoming email, then drafts a reply that answers its questions', async () => {
    const analysis = {
      senderName: 'Priya',
      summary: 'Priya asks about pricing and a demo',
      intent: 'Evaluate the product',
      questions: ['What does the Pro plan cost?'],
      requestedActions: ['Schedule a demo'],
      deadlines: ['Friday'],
      sentiment: 'positive',
    };
    llm.generateStructured
      .mockResolvedValueOnce(aiResult(analysis))
      .mockResolvedValueOnce(aiResult({ subject: 'Re: Pricing', body: 'Hi Priya, ...', placeholders: [] }));

    const { agent } = await signedInAgent();
    const res = await agent
      .post('/api/emails/reply')
      .send({ incomingEmail: 'Hi, what does the Pro plan cost? Can we do a demo before Friday? - Priya', tone: 'friendly' })
      .expect(201);

    expect(res.body.email).toMatchObject({ mode: 'reply', subject: 'Re: Pricing', analysis });
    expect(llm.generateStructured).toHaveBeenCalledTimes(2);
    // Step 2 receives the extracted questions as an explicit checklist.
    expect(llm.generateStructured.mock.calls[1]![0].user).toContain('What does the Pro plan cost?');
  });
});

describe('history', () => {
  async function seed(userId: string, count: number, extra: Record<string, unknown> = {}) {
    const docs = Array.from({ length: count }, (_, i) => ({
      userId,
      mode: 'compose',
      type: 'business',
      tone: 'professional',
      subject: `Email ${i}`,
      body: 'body',
      wordCount: 1,
      ...extra,
    }));
    for (const d of docs) await EmailModel.create(d); // sequential => increasing _ids
  }

  it('paginates with a cursor, newest first, without duplicates', async () => {
    const { agent, user } = await signedInAgent();
    await seed(user.id, 25);

    const page1 = await agent.get('/api/emails?limit=10').expect(200);
    const page2 = await agent.get(`/api/emails?limit=10&cursor=${page1.body.nextCursor}`).expect(200);
    const page3 = await agent.get(`/api/emails?limit=10&cursor=${page2.body.nextCursor}`).expect(200);

    expect(page1.body.items[0].subject).toBe('Email 24');
    expect(page3.body.items).toHaveLength(5);
    expect(page3.body.nextCursor).toBeNull();
    const ids = [...page1.body.items, ...page2.body.items, ...page3.body.items].map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(25);
  });

  it('filters on the server', async () => {
    const { agent, user } = await signedInAgent();
    await seed(user.id, 3);
    await seed(user.id, 2, { type: 'sales' });
    const res = await agent.get('/api/emails?type=sales').expect(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("never exposes another user's emails", async () => {
    const alice = await signedInAgent();
    const bob = await signedInAgent();
    await seed(alice.user.id, 1);
    const aliceEmail = (await alice.agent.get('/api/emails').expect(200)).body.items[0];

    expect((await bob.agent.get('/api/emails').expect(200)).body.items).toHaveLength(0);
    await bob.agent.get(`/api/emails/${aliceEmail.id}`).expect(404);
    await bob.agent.delete(`/api/emails/${aliceEmail.id}`).expect(404);
    await alice.agent.get(`/api/emails/${aliceEmail.id}`).expect(200);
  });

  it('saves the edited final version and recipient, only for the owner', async () => {
    const alice = await signedInAgent();
    const bob = await signedInAgent();
    const { body } = await alice.agent.post('/api/emails/compose').send(composeBody).expect(201);
    const id = body.email.id;

    const res = await alice.agent
      .patch(`/api/emails/${id}`)
      .send({ body: 'Hi Rahul,\n\nThank you for meeting.', recipient: 'rahul@acme.dev, hr@acme.dev' })
      .expect(200);
    expect(res.body.email).toMatchObject({ recipient: 'rahul@acme.dev, hr@acme.dev', placeholders: [], wordCount: 6 });
    expect(res.body.email.finalizedAt).toBeTruthy();

    await alice.agent.patch(`/api/emails/${id}`).send({ recipient: 'not-an-email' }).expect(400);
    await alice.agent.patch(`/api/emails/${id}`).send({}).expect(400);
    await bob.agent.patch(`/api/emails/${id}`).send({ subject: 'hacked' }).expect(404);
  });

  it('returns 400 for malformed ids', async () => {
    const { agent } = await signedInAgent();
    const res = await agent.get('/api/emails/not-an-id').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('deletes one email and clears all history', async () => {
    const { agent, user } = await signedInAgent();
    await seed(user.id, 3);
    const [first] = (await agent.get('/api/emails').expect(200)).body.items;

    await agent.delete(`/api/emails/${first.id}`).expect(204);
    const cleared = await agent.delete('/api/emails').expect(200);
    expect(cleared.body.deletedCount).toBe(2);
  });
});
