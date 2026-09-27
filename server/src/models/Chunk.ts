import { Schema, model, type InferSchemaType } from 'mongoose';

// A ~1000-character piece of a knowledge document plus its embedding vector.
// Searched with the Atlas Vector Search index `chunk_vector_index` (see scripts/createIndexes.ts).
const chunkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'KnowledgeDocument', required: true, index: true },
    documentTitle: { type: String, required: true }, // denormalised so search results need no join
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true },
);

export type Chunk = InferSchemaType<typeof chunkSchema>;
export const ChunkModel = model('Chunk', chunkSchema);

export const VECTOR_INDEX_NAME = 'chunk_vector_index';
