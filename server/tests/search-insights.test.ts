import { beforeEach, describe, expect, it, vi } from 'vitest';

const embeddings = vi.hoisted(() => ({
  embedTexts: vi.fn(async (texts: string[]) => ({ vectors: texts.map(() => [0.1, 0.2]), tokens: 0 })),
  embedQuery: vi.fn(async () => [0.1, 0.2]),
}));
vi.mock('../src/modules/ai/embeddings.js', () => embeddings);

import { signedInAgent } from './helpers.js';
import { EmailModel } from '../src/models/Email.js';
import { indexPendingEmails, reciprocalRankFusion } from '../src/modules/emails/emails.service.js';

type Seed = Partial<{ mode: string; type: string; tone: string; subject: string; body: string; recipient: string; placeholders: string[]; createdAt: Date }>;

async function seed(userId: string, e: Seed = {}) {
  return EmailModel.create({
    userId,
    mode: 'compose',
    type: 'business',
    tone: 'professional',
    subject: 'Hello',
    body: 'Some body text',
    wordCount: 3,
    ai: { model: 'm', promptTokens: 100, completionTokens: 50, latencyMs: 1000 },
    ...e,
  });
}

beforeEach(() => {
  embeddings.embedTexts.mockClear();
});

describe('reciprocalRankFusion', () => {
  it('ranks items found by both searches first', () => {
    const fused = reciprocalRankFusion([
      { name: 'keyword', ids: ['a', 'b', 'c'] },
      { name: 'meaning', ids: ['c', 'd'] },
    ]);
    expect(fused[0]).toMatchObject({ id: 'c', matchedBy: ['keyword', 'meaning'] });
    // a is #1 in one list (1/61); b and d are #2 in one list each (1/62) — a tie.
    expect(fused.map((f) => f.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(fused[2]!.score).toBe(fused[3]!.score);
  });
});

describe('GET /api/emails/search', () => {
  it('finds emails by keyword, only for the current user', async () => {
    const alice = await signedInAgent();
    const bob = await signedInAgent();
    await seed(alice.user.id, { subject: 'Invoice for March', body: 'Please find the invoice attached.' });
    await seed(alice.user.id, { subject: 'Lunch plans', body: 'Pizza on Friday?' });
    await seed(bob.user.id, { subject: 'Invoice from Bob', body: 'Bob invoice' });

    const res = await alice.agent.get('/api/emails/search?q=invoice').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ subject: 'Invoice for March', matchedBy: ['keyword'] });
  });

  it('validates the query', async () => {
    const { agent } = await signedInAgent();
    await agent.get('/api/emails/search?q=a').expect(400);
  });
});

describe('email search indexing job', () => {
  it('embeds new emails in one batch, and re-embeds after an edit', async () => {
    const { agent, user } = await signedInAgent();
    const email = await seed(user.id);
    await seed(user.id);

    expect(await indexPendingEmails()).toBe(true);
    expect(embeddings.embedTexts).toHaveBeenCalledTimes(1);
    expect(await EmailModel.countDocuments({ embeddedAt: null })).toBe(0);
    expect(await indexPendingEmails()).toBe(false);

    await agent.patch(`/api/emails/${email.id}`).send({ body: 'Edited text' }).expect(200);
    expect(await EmailModel.countDocuments({ embeddedAt: null })).toBe(1);
  });
});

describe('GET /api/insights', () => {
  it('summarises the last N days with one aggregation', async () => {
    const { agent, user } = await signedInAgent();
    await seed(user.id, { type: 'sales', recipient: 'a@x.dev, B@x.dev', placeholders: ['[Date]'] });
    await seed(user.id, { type: 'sales', recipient: 'a@x.dev' });
    await seed(user.id, { mode: 'reply', type: undefined, tone: 'friendly' });
    await seed(user.id, { createdAt: new Date(Date.now() - 40 * 24 * 3600_000) }); // outside 30 days

    const res = await agent.get('/api/insights?days=30&tz=Asia/Kolkata').expect(200);
    const b = res.body;

    expect(b.totals).toMatchObject({ emails: 3, composed: 2, replies: 1, sentViaGmail: 2, withPlaceholders: 1 });
    expect(b.perDay).toHaveLength(30);
    expect(b.perDay.at(-1).count).toBe(3); // all three are from today
    expect(b.byType[0]).toMatchObject({ type: 'sales', label: 'Sales Pitch', count: 2 });
    expect(b.topRecipients).toEqual([
      { address: 'a@x.dev', count: 2 },
      { address: 'b@x.dev', count: 1 },
    ]);
    expect(b.ai).toMatchObject({ promptTokens: 300, completionTokens: 150, avgLatencyMs: 1000 });
  });

  it('rejects unknown time zones and ranges', async () => {
    const { agent } = await signedInAgent();
    await agent.get('/api/insights?tz=Mars/Olympus').expect(400);
    await agent.get('/api/insights?days=12').expect(400);
  });
});
