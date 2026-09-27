import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const DOCUMENT_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;

// A file or pasted text the user wants emails to be grounded in.
// `status` doubles as a simple job queue: the ingestion worker picks up `pending` documents.
const knowledgeDocumentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    sourceType: { type: String, enum: ['pdf', 'text'], required: true },
    // Extracted text is only needed by the worker, so it is excluded from normal queries.
    text: { type: String, required: true, select: false },
    status: { type: String, enum: DOCUMENT_STATUSES, default: 'pending' },
    chunkCount: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
    lockedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

knowledgeDocumentSchema.index({ userId: 1, createdAt: -1 });
knowledgeDocumentSchema.index({ status: 1, createdAt: 1 }); // worker: oldest pending first

export type KnowledgeDocument = InferSchemaType<typeof knowledgeDocumentSchema>;
export type KnowledgeDocumentDoc = HydratedDocument<KnowledgeDocument>;
export const KnowledgeDocumentModel = model('KnowledgeDocument', knowledgeDocumentSchema);

export function toDocumentDTO(doc: KnowledgeDocumentDoc) {
  return {
    id: doc.id as string,
    title: doc.title,
    sourceType: doc.sourceType,
    status: doc.status,
    chunkCount: doc.chunkCount,
    error: doc.error,
    createdAt: doc.createdAt,
  };
}
