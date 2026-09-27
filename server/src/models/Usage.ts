import { Schema, model, type InferSchemaType } from 'mongoose';

// One document per user per UTC day. Updated with an atomic $inc, so concurrent
// requests can't race each other past the daily limit.
const usageSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD' (UTC)
  requests: { type: Number, default: 0 },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
});

usageSchema.index({ userId: 1, date: 1 }, { unique: true });
usageSchema.index({ date: 1 }); // admin stats

export type Usage = InferSchemaType<typeof usageSchema>;
export const UsageModel = model('Usage', usageSchema);
