import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env, isProd } from './config/env.js';
import { EMAIL_TYPES, LIMITS, TONES } from './config/constants.js';
import { isDbUp } from './db.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { emailsRouter } from './modules/emails/emails.routes.js';
import { knowledgeRouter } from './modules/knowledge/knowledge.routes.js';
import { usageRouter } from './modules/usage/usage.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { insightsRouter } from './modules/insights/insights.routes.js';
import { remindersRouter } from './modules/reminders/reminders.routes.js';

// The app is built separately from `listen()` so tests can use it with supertest.
export function createApp() {
  const app = express();

  // Real client IPs behind proxies (Vercel → Render). Rate limiting is per IP, so this matters:
  // with the wrong value every user would look like the same proxy IP and share one limit.
  app.set('trust proxy', env.TRUST_PROXY_HOPS ?? (isProd ? 1 : 0));

  app.use(helmet());
  // Every request gets an id; it's in every log line and in error responses, so a user's
  // "requestId" can be matched to the exact server logs.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.status(isDbUp() ? 200 : 503).json({ status: 'ok', db: isDbUp() ? 'up' : 'down' });
  });

  app.get('/api/meta', (_req, res) => {
    res.json({
      emailTypes: EMAIL_TYPES,
      tones: TONES,
      limits: {
        promptMinChars: LIMITS.promptMinChars,
        promptMaxChars: LIMITS.promptMaxChars,
        incomingEmailMaxChars: LIMITS.incomingEmailMaxChars,
        instructionsMaxChars: LIMITS.instructionsMaxChars,
        knowledgeTextMaxChars: LIMITS.knowledgeTextMaxChars,
        minWords: LIMITS.minWords,
        maxWords: LIMITS.maxWords,
        maxUploadMb: LIMITS.maxUploadMb,
      },
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/usage', usageRouter);
  app.use('/api/reminders', remindersRouter);
  app.use('/api/insights', insightsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', notFoundHandler);

  // Production: serve the built React app from the same origin — one deployment, no CORS.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (isProd && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
