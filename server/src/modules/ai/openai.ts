import OpenAI from 'openai';
import { env } from '../../config/env.js';

// One shared client. The SDK retries 429/5xx responses with exponential backoff (maxRetries),
// and `timeout` makes sure a hung request can't keep an HTTP request open forever.
// `baseURL` lets the same code talk to any OpenAI-compatible provider (OpenAI, Google Gemini, ...).
export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL,
  timeout: env.OPENAI_TIMEOUT_MS,
  maxRetries: 2,
});
