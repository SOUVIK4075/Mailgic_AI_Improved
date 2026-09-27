// Run with `npm run db:indexes` — builds all normal indexes and the vector search index.
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../db.js';
import { logger } from '../lib/logger.js';
import { ensureVectorIndexes } from '../modules/knowledge/vectorIndex.js';
import '../models/User.js';
import '../models/Session.js';
import '../models/Email.js';
import '../models/KnowledgeDocument.js';
import '../models/Chunk.js';
import '../models/Usage.js';
import '../models/Reminder.js';
import '../models/IdempotencyKey.js';

await connectDB();
for (const model of Object.values(mongoose.models)) {
  await model.syncIndexes();
  logger.info(`Indexes synced for ${model.modelName}`);
}
await ensureVectorIndexes();
await disconnectDB();
