import { env } from './config/env.js';
import { connectDB, disconnectDB } from './db.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { startWorker } from './jobs/worker.js';
import { indexPendingEmails } from './modules/emails/emails.service.js';
import { processNextDocument } from './modules/knowledge/ingestion.worker.js';
import { ensureVectorIndexes } from './modules/knowledge/vectorIndex.js';
import { processDueReminder } from './modules/reminders/reminders.service.js';

async function main() {
  await connectDB();
  await ensureVectorIndexes();

  const stopWorker = startWorker([
    { name: 'document-ingestion', run: processNextDocument },
    { name: 'reminders', run: processDueReminder },
    { name: 'email-search-index', run: () => indexPendingEmails() },
  ]);
  const server = createApp().listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`));

  // Graceful shutdown: stop taking new requests, let in-flight ones finish, then close the DB.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopWorker();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // force-exit if something hangs
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
