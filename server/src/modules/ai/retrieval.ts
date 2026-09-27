import { Types } from 'mongoose';
import { RAG } from '../../config/constants.js';
import { logger } from '../../lib/logger.js';
import { ChunkModel, VECTOR_INDEX_NAME } from '../../models/Chunk.js';
import { KnowledgeDocumentModel } from '../../models/KnowledgeDocument.js';
import { embedQuery } from './embeddings.js';

export type RetrievedChunk = {
  documentId: string;
  title: string;
  chunkIndex: number;
  score: number;
  text: string;
};

/**
 * RAG step 1 — Retrieval: find the user's knowledge chunks most relevant to `query`.
 *
 * - Skips the embedding call entirely if the user has no ready documents (saves cost + latency).
 * - The `filter: { userId }` inside $vectorSearch guarantees users only ever see their own data.
 * - Low-score chunks are dropped: passing unrelated text to the LLM makes answers worse, not better.
 * - If vector search fails, we log and continue without context — the email still gets written.
 */
export async function retrieveRelevantChunks(userId: string, query: string): Promise<RetrievedChunk[]> {
  const hasDocs = await KnowledgeDocumentModel.exists({ userId, status: 'ready' });
  if (!hasDocs) return [];

  try {
    const queryVector = await embedQuery(query);
    const results = await ChunkModel.aggregate<RetrievedChunk & { _id: unknown }>([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector,
          numCandidates: RAG.topK * 25,
          limit: RAG.topK,
          filter: { userId: new Types.ObjectId(userId) },
        },
      },
      {
        $project: {
          _id: 0,
          documentId: { $toString: '$documentId' },
          title: '$documentTitle',
          chunkIndex: 1,
          text: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);

    return results.filter((r) => r.score >= RAG.minScore);
  } catch (err) {
    logger.warn({ err }, 'Vector search failed — continuing without knowledge context');
    return [];
  }
}
