import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const sourceSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'KnowledgeDocument' },
    title: String,
    chunkIndex: Number,
    score: Number,
    excerpt: String,
  },
  { _id: false },
);

const analysisSchema = new Schema(
  {
    senderName: { type: String, default: null },
    summary: String,
    intent: String,
    questions: [String],
    requestedActions: [String],
    deadlines: [String],
    sentiment: String,
  },
  { _id: false },
);

const emailSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: String, enum: ['compose', 'reply'], required: true },
    type: { type: String, default: null },
    tone: { type: String, required: true },
    prompt: { type: String, default: '' },
    incomingEmail: { type: String, default: null },
    analysis: { type: analysisSchema, default: null },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    placeholders: { type: [String], default: [] },
    sources: { type: [sourceSchema], default: [] },
    wordCount: { type: Number, required: true },
    // Set when the user edits the draft and hands it off to Gmail: who it's going to, and when.
    recipient: { type: String, default: null },
    finalizedAt: { type: Date, default: null },
    // For "search by meaning". Filled in by a background job a few seconds after the email is saved
    // (and again after an edit), so writing an email never waits for the embedding API.
    embedding: { type: [Number], default: undefined, select: false },
    embeddedAt: { type: Date, default: null },
    // Observability for AI calls: lets us answer "how much does one email cost / how slow is it?"
    ai: {
      model: String,
      promptTokens: Number,
      completionTokens: Number,
      latencyMs: Number,
    },
  },
  { timestamps: true },
);

// History is always "this user's emails, newest first", optionally filtered by mode or type.
// Sorting by _id works because ObjectIds increase over time, and it gives us a stable cursor.
emailSchema.index({ userId: 1, _id: -1 });
emailSchema.index({ userId: 1, mode: 1, type: 1, _id: -1 });
emailSchema.index({ userId: 1, createdAt: -1 }); // insights: "this user's emails in the last N days"
emailSchema.index({ embeddedAt: 1 }); // indexing job: "emails not embedded yet"
// Keyword search. A collection can have only one text index; subject matches count 3x.
emailSchema.index(
  { subject: 'text', body: 'text', prompt: 'text' },
  { weights: { subject: 3, body: 1, prompt: 1 }, name: 'email_text_index' },
);

export type Email = InferSchemaType<typeof emailSchema>;
export type EmailDoc = HydratedDocument<Email>;
export const EmailModel = model('Email', emailSchema);

export const EMAIL_VECTOR_INDEX_NAME = 'email_vector_index';
