import { Schema, model, type InferSchemaType } from 'mongoose';

// Remembers the result of an AI request by the client's Idempotency-Key, so a retried request
// (double click, flaky network) gets the stored answer instead of a second AI call.
const idempotencyKeySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true },
  // Hash of method + path + body: the same key must not be reused for a different request.
  requestHash: { type: String, required: true },
  status: { type: String, enum: ['processing', 'completed'], default: 'processing' },
  response: { type: Schema.Types.Mixed, default: null },
  expiresAt: { type: Date, required: true },
});

// Unique per user: the insert itself is the "lock" — only one request can own a key.
idempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL: MongoDB cleans up after 24 h

export type IdempotencyKey = InferSchemaType<typeof idempotencyKeySchema>;
export const IdempotencyKeyModel = model('IdempotencyKey', idempotencyKeySchema);
