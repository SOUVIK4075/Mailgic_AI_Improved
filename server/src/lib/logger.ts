import pino from 'pino';
import { env, isProd } from '../config/env.js';

// Structured JSON logs in production (easy to search in any log tool),
// pretty-printed logs in development.
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
