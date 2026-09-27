import { z } from 'zod';

// Validate environment variables once at startup. If something is missing the
// process exits immediately with a clear message instead of failing later at runtime.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  OPENAI_API_KEY: z.string().min(1),
  // Any OpenAI-compatible provider works by changing the base URL, e.g. Google Gemini:
  // https://generativelanguage.googleapis.com/v1beta/openai/  (empty = OpenAI itself)
  OPENAI_BASE_URL: z.url().optional(),
  // Optional. "Thinking" models spend output tokens on reasoning; a low effort keeps the budget
  // for the email itself. Supported values differ per model (Gemini flash: none/low, flash-lite: minimal/low).
  OPENAI_REASONING_EFFORT: z.enum(['none', 'minimal', 'low', 'medium', 'high']).optional(),
  // Main model writes the email; the fast (cheaper) model does extraction work.
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_FAST_MODEL: z.string().default('gpt-4o-mini'),
  // Optional. Used when the requested model is overloaded / rate-limited (HTTP 429 or 5xx).
  OPENAI_FALLBACK_MODEL: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  DAILY_AI_REQUEST_LIMIT: z.coerce.number().int().positive().default(50),

  // Optional: without SMTP the password-reset link is written to the server log (dev only).
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Mailgic-AI <no-reply@mailgic.local>'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === 'production';
