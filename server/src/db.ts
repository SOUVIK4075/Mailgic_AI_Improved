import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

export async function connectDB(uri = env.MONGODB_URI): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Never log the URI itself — it contains the database password.
  logger.info({ db: mongoose.connection.name, host: mongoose.connection.host }, 'MongoDB connected');
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

export const isDbUp = () => mongoose.connection.readyState === 1;
