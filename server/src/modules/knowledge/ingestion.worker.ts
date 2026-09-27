import { RAG } from '../../config/constants.js';
import { logger } from '../../lib/logger.js';
import { ChunkModel } from '../../models/Chunk.js';
import { KnowledgeDocumentModel } from '../../models/KnowledgeDocument.js';
import { embedTexts } from '../ai/embeddings.js';
import { recordTokens } from '../usage/usage.service.js';
import { chunkText } from './chunker.js';

const MAX_ATTEMPTS = 3;
const STALE_LOCK_MS = 5 * 60 * 1000;

/**
 * Background job: turn one `pending` document into embedded chunks.
 *
 * MongoDB is the queue — no Redis/BullMQ needed at this scale:
 *  - Claiming uses one atomic findOneAndUpdate (pending -> processing), so even with several
 *    server instances the same document is never processed twice.
 *  - Failures are retried up to MAX_ATTEMPTS, then marked `failed` with the error message.
 *  - If the server crashes mid-job, the document stays `processing`; the stale-lock check puts it back.
 *
 * Returns true if a document was processed (so the caller can immediately look for the next one).
 */
export async function processNextDocument(): Promise<boolean> {
  await KnowledgeDocumentModel.updateMany(
    { status: 'processing', lockedAt: { $lt: new Date(Date.now() - STALE_LOCK_MS) } },
    { status: 'pending', lockedAt: null },
  );

  const doc = await KnowledgeDocumentModel.findOneAndUpdate(
    { status: 'pending' },
    { status: 'processing', lockedAt: new Date(), $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true },
  ).select('+text');
  if (!doc) return false;

  const log = logger.child({ documentId: doc.id });
  try {
    const pieces = chunkText(doc.text, RAG.chunkSize, RAG.chunkOverlap);
    const { vectors, tokens } = await embedTexts(pieces);

    // Delete first so a retried job doesn't create duplicate chunks (makes the job idempotent).
    await ChunkModel.deleteMany({ documentId: doc._id });
    await ChunkModel.insertMany(
      pieces.map((text, i) => ({
        userId: doc.userId,
        documentId: doc._id,
        documentTitle: doc.title,
        chunkIndex: i,
        text,
        embedding: vectors[i],
      })),
    );

    const updated = await KnowledgeDocumentModel.updateOne(
      { _id: doc._id },
      { status: 'ready', chunkCount: pieces.length, error: null, lockedAt: null },
    );
    // The user deleted the document while we were embedding it — clean up the orphaned chunks.
    if (updated.matchedCount === 0) await ChunkModel.deleteMany({ documentId: doc._id });

    await recordTokens(String(doc.userId), { promptTokens: tokens, completionTokens: 0 });
    log.info({ chunks: pieces.length, tokens }, 'Document ingested');
  } catch (err) {
    const failed = doc.attempts >= MAX_ATTEMPTS;
    log.error({ err, attempt: doc.attempts }, failed ? 'Document ingestion failed permanently' : 'Document ingestion failed, will retry');
    await KnowledgeDocumentModel.updateOne(
      { _id: doc._id },
      {
        status: failed ? 'failed' : 'pending',
        lockedAt: null,
        error: failed ? 'Could not process this document. Please try uploading it again.' : null,
      },
    );
  }
  return true;
}
