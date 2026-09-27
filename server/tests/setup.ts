import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Env must be set before any app module is imported (config/env.ts validates on import).
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://placeholder'; // replaced below with the in-memory server
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.OPENAI_API_KEY = 'sk-test';
process.env.DAILY_AI_REQUEST_LIMIT = '3';
process.env.OPENAI_FALLBACK_MODEL = 'fallback-model';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // Build unique indexes up front — tests rely on them (duplicate email, usage quota).
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
