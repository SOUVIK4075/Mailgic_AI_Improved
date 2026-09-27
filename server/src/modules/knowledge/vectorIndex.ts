import type { Model } from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { ChunkModel, VECTOR_INDEX_NAME } from '../../models/Chunk.js';
import { EmailModel, EMAIL_VECTOR_INDEX_NAME } from '../../models/Email.js';

/**
 * Creates an Atlas Vector Search index on `<collection>.embedding` if it doesn't exist yet.
 * `userId` is declared as a filter field so $vectorSearch can restrict results to one user.
 * Works on MongoDB Atlas and on the `mongodb/mongodb-atlas-local` Docker image.
 */
async function ensureVectorIndex(model: Model<any>, name: string): Promise<void> {
  try {
    await model.createCollection();
    const existing = await model.collection.listSearchIndexes(name).toArray();
    if (existing.length > 0) return;

    await model.collection.createSearchIndex({
      name,
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: env.EMBEDDING_DIMENSIONS, similarity: 'cosine' },
          { type: 'filter', path: 'userId' },
        ],
      },
    });
    logger.info({ index: name }, 'Vector search index created (it may take a minute to become queryable)');
  } catch (err) {
    // Plain MongoDB (not Atlas) has no search indexes. The app still works; that search is just skipped.
    logger.warn({ index: name, err: (err as Error).message }, 'Could not ensure vector search index');
  }
}

/** Knowledge-base chunks (RAG) and emails (history search). */
export async function ensureVectorIndexes(): Promise<void> {
  await ensureVectorIndex(ChunkModel, VECTOR_INDEX_NAME);
  await ensureVectorIndex(EmailModel, EMAIL_VECTOR_INDEX_NAME);
}
