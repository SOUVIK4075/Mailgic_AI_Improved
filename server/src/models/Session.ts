import { Schema, model, type InferSchemaType } from 'mongoose';

// One document per refresh token (i.e. per logged-in device).
// Refresh tokens are opaque random strings; we store only their hash.
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

// TTL index: MongoDB deletes the session automatically once `expiresAt` has passed.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type Session = InferSchemaType<typeof sessionSchema>;
export const SessionModel = model('Session', sessionSchema);
