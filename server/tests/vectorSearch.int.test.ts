import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';

/**
 * Integration test for real Atlas Vector Search ($vectorSearch isn't supported by the in-memory
 * MongoDB used elsewhere). Skipped unless ATLAS_TEST_URI is set, e.g.:
 *   docker run -d -p 27018:27017 mongodb/mongodb-atlas-local:8.0
 *   ATLAS_TEST_URI="mongodb://localhost:27018/mailgic_test?directConnection=true" npm test
 */
const ATLAS_URI = process.env.ATLAS_TEST_URI;

const queryVector = vi.hoisted(() => ({ value: [] as number[] }));
vi.mock('../src/modules/ai/embeddings.js', () => ({ embedQuery: async () => queryVector.value }));

import { ChunkModel, VECTOR_INDEX_NAME } from '../src/models/Chunk.js';
import { KnowledgeDocumentModel } from '../src/models/KnowledgeDocument.js';
import { ensureVectorIndexes } from '../src/modules/knowledge/vectorIndex.js';
import { retrieveRelevantChunks } from '../src/modules/ai/retrieval.js';

const DIMS = 1536;
// A unit vector pointing along one axis: axis 0 = "refunds", axis 1 = "shipping".
const axis = (i: number) => Array.from({ length: DIMS }, (_, j) => (j === i ? 1 : 0));

async function waitForIndexReady() {
  for (let i = 0; i < 60; i++) {
    const [index] = await ChunkModel.collection.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
    if (index?.queryable) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Vector index did not become queryable in 60s');
}

describe.skipIf(!ATLAS_URI)('Atlas Vector Search (integration)', () => {
  const alice = new Types.ObjectId();
  const bob = new Types.ObjectId();

  beforeAll(async () => {
    await mongoose.disconnect();
    await mongoose.connect(ATLAS_URI!);
    await mongoose.connection.dropDatabase();
    await ensureVectorIndexes();
    await waitForIndexReady();
  }, 90_000);

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('returns the most similar chunks for the right user only, and drops weak matches', async () => {
    const doc = await KnowledgeDocumentModel.create({ userId: alice, title: 'Policies', text: 'x', sourceType: 'text', status: 'ready' });
    const bobDoc = await KnowledgeDocumentModel.create({ userId: bob, title: 'Bob secrets', text: 'x', sourceType: 'text', status: 'ready' });
    await ChunkModel.insertMany([
      { userId: alice, documentId: doc._id, documentTitle: 'Policies', chunkIndex: 0, text: 'Refunds within 30 days', embedding: axis(0) },
      { userId: alice, documentId: doc._id, documentTitle: 'Policies', chunkIndex: 1, text: 'Shipping takes 5 days', embedding: axis(1) },
      // Bob's chunk is a *perfect* match for the query — it must still never be returned to Alice.
      { userId: bob, documentId: bobDoc._id, documentTitle: 'Bob secrets', chunkIndex: 0, text: 'Bob only', embedding: axis(0) },
    ]);

    queryVector.value = axis(0);
    // Newly inserted docs take a moment to be indexed.
    let results: Awaited<ReturnType<typeof retrieveRelevantChunks>> = [];
    for (let i = 0; i < 30 && results.length === 0; i++) {
      results = await retrieveRelevantChunks(alice.toString(), 'what is the refund policy?');
      if (results.length === 0) await new Promise((r) => setTimeout(r, 1000));
    }

    expect(results).toHaveLength(1); // "shipping" chunk (cosine 0 => score 0.5) is below minScore
    expect(results[0]).toMatchObject({ text: 'Refunds within 30 days', title: 'Policies', chunkIndex: 0 });
    expect(results[0]!.score).toBeCloseTo(1, 3);
  }, 60_000);
});
