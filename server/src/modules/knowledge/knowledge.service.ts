import { LIMITS } from '../../config/constants.js';
import { AppError, notFound } from '../../lib/errors.js';
import { ChunkModel } from '../../models/Chunk.js';
import { KnowledgeDocumentModel } from '../../models/KnowledgeDocument.js';

export async function createDocument(userId: string, input: { title: string; text: string; sourceType: 'pdf' | 'text' }) {
  const text = input.text.trim();
  if (!text) {
    throw new AppError(422, 'NO_TEXT_FOUND', 'No readable text found. Scanned PDFs (images) are not supported.');
  }
  if (text.length > LIMITS.knowledgeTextMaxChars) {
    throw new AppError(413, 'DOCUMENT_TOO_LONG', `Documents can have at most ${LIMITS.knowledgeTextMaxChars} characters`);
  }

  const count = await KnowledgeDocumentModel.countDocuments({ userId });
  if (count >= LIMITS.maxDocumentsPerUser) {
    throw new AppError(409, 'DOCUMENT_LIMIT_REACHED', `You can store at most ${LIMITS.maxDocumentsPerUser} documents`);
  }

  // Saved as `pending` — the ingestion worker chunks and embeds it in the background,
  // so the upload request returns immediately instead of waiting on the embedding API.
  return KnowledgeDocumentModel.create({ userId, title: input.title, text, sourceType: input.sourceType });
}

export function listDocuments(userId: string) {
  return KnowledgeDocumentModel.find({ userId }).sort({ createdAt: -1 });
}

export async function deleteDocument(userId: string, id: string) {
  const doc = await KnowledgeDocumentModel.findOneAndDelete({ _id: id, userId });
  if (!doc) throw notFound('Document');
  await ChunkModel.deleteMany({ documentId: doc._id });
}
