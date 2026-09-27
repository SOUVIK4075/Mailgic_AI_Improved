import { beforeEach, describe, expect, it, vi } from 'vitest';

const embeddings = vi.hoisted(() => ({
  embedTexts: vi.fn(async (texts: string[]) => ({ vectors: texts.map(() => [0.1, 0.2, 0.3]), tokens: texts.length * 10 })),
  embedQuery: vi.fn(),
}));
vi.mock('../src/modules/ai/embeddings.js', () => embeddings);

import { signedInAgent } from './helpers.js';
import { ChunkModel } from '../src/models/Chunk.js';
import { KnowledgeDocumentModel } from '../src/models/KnowledgeDocument.js';
import { processNextDocument } from '../src/modules/knowledge/ingestion.worker.js';
import { chunkText } from '../src/modules/knowledge/chunker.js';

const policy = 'Refunds are available within 30 days of purchase. '.repeat(60);

beforeEach(() => {
  embeddings.embedTexts.mockClear();
});

describe('knowledge upload', () => {
  it('accepts a .txt upload and queues it for background processing', async () => {
    const { agent } = await signedInAgent();
    const res = await agent.post('/api/knowledge').attach('file', Buffer.from(policy), 'refund-policy.txt').expect(202);

    expect(res.body.document).toMatchObject({ title: 'refund-policy', status: 'pending', sourceType: 'text' });
    expect(embeddings.embedTexts).not.toHaveBeenCalled(); // not embedded inside the request
  });

  it('accepts pasted text as JSON', async () => {
    const { agent } = await signedInAgent();
    const res = await agent.post('/api/knowledge').send({ title: 'About me', text: 'I am a backend developer.' }).expect(202);
    expect(res.body.document.title).toBe('About me');
  });

  it('rejects unsupported file types', async () => {
    const { agent } = await signedInAgent();
    const res = await agent.post('/api/knowledge').attach('file', Buffer.from('x'), 'virus.exe').expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it("deleting a document removes its chunks, and users can't delete each other's", async () => {
    const alice = await signedInAgent();
    const bob = await signedInAgent();
    const { body } = await alice.agent.post('/api/knowledge').send({ title: 'Policy', text: policy }).expect(202);
    await processNextDocument();
    expect(await ChunkModel.countDocuments({ documentId: body.document.id })).toBeGreaterThan(0);

    await bob.agent.delete(`/api/knowledge/${body.document.id}`).expect(404);
    await alice.agent.delete(`/api/knowledge/${body.document.id}`).expect(204);
    expect(await ChunkModel.countDocuments({ documentId: body.document.id })).toBe(0);
  });
});

describe('ingestion worker', () => {
  it('chunks, embeds and marks the document ready', async () => {
    const { agent, user } = await signedInAgent();
    const { body } = await agent.post('/api/knowledge').send({ title: 'Policy', text: policy }).expect(202);

    expect(await processNextDocument()).toBe(true);

    const doc = await KnowledgeDocumentModel.findById(body.document.id);
    const chunks = await ChunkModel.find({ documentId: body.document.id }).sort({ chunkIndex: 1 });
    expect(doc).toMatchObject({ status: 'ready', chunkCount: chunks.length });
    expect(chunks.length).toBeGreaterThan(1);
    expect(String(chunks[0]!.userId)).toBe(user.id);
    expect(embeddings.embedTexts).toHaveBeenCalledTimes(1); // one batched call, not one per chunk

    expect(await processNextDocument()).toBe(false); // queue is empty
  });

  it('retries failures and marks the document failed after 3 attempts', async () => {
    const { agent } = await signedInAgent();
    const { body } = await agent.post('/api/knowledge').send({ title: 'Policy', text: policy }).expect(202);
    embeddings.embedTexts.mockRejectedValue(new Error('embedding API down'));

    await processNextDocument();
    expect((await KnowledgeDocumentModel.findById(body.document.id))!.status).toBe('pending');
    await processNextDocument();
    await processNextDocument();

    const doc = await KnowledgeDocumentModel.findById(body.document.id);
    expect(doc).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await ChunkModel.countDocuments()).toBe(0);
    embeddings.embedTexts.mockReset();
  });
});

describe('chunkText', () => {
  it('returns one chunk for short text', () => {
    expect(chunkText('Hello world.', 1000, 150)).toEqual(['Hello world.']);
  });

  it('keeps chunks under the size limit, overlapping, and cut at word boundaries', () => {
    const chunks = chunkText(policy, 1000, 150);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);

    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!;
      const firstWord = chunks[i]!.split(' ')[0]!;
      // Starts on a whole word (the text is made of these words only)...
      expect(['Refunds', 'are', 'available', 'within', '30', 'days', 'of', 'purchase.']).toContain(firstWord);
      // ...and overlaps: the next chunk's opening text also appears near the end of the previous one.
      expect(prev.slice(-300)).toContain(chunks[i]!.slice(0, 40));
    }
  });
});
