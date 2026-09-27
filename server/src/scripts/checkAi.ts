// Run with `npm run ai:check` — makes one real structured-output call and one embedding call
// with the settings in server/.env, so you know the AI provider works before starting the app.
import { env } from '../config/env.js';
import { generateStructured } from '../modules/ai/llm.js';
import { embedTexts } from '../modules/ai/embeddings.js';
import { emailOutputSchema } from '../modules/ai/prompts.js';

console.log(`Provider: ${env.OPENAI_BASE_URL ?? 'OpenAI (default)'}`);
let ok = true;

try {
  const res = await generateStructured({
    model: env.OPENAI_CHAT_MODEL,
    schemaName: 'email',
    schema: emailOutputSchema,
    system: 'Write a very short email. If a detail is missing, use a [Placeholder] and list it in "placeholders".',
    user: 'Ask my manager for leave next Friday.',
    maxTokens: 400,
  });
  console.log(`\n✅ Chat (${env.OPENAI_CHAT_MODEL}) — ${res.latencyMs} ms, ${res.usage.promptTokens}+${res.usage.completionTokens} tokens`);
  console.log(JSON.stringify(res.data, null, 2));
} catch (err) {
  ok = false;
  console.error(`\n❌ Chat (${env.OPENAI_CHAT_MODEL}) failed:`, (err as Error).message);
}

try {
  const { vectors } = await embedTexts(['refund policy', 'shipping times']);
  console.log(`\n✅ Embeddings (${env.OPENAI_EMBEDDING_MODEL}) — ${vectors.length} vectors × ${vectors[0]!.length} dimensions`);
} catch (err) {
  ok = false;
  console.error(`\n❌ Embeddings (${env.OPENAI_EMBEDDING_MODEL}) failed:`, (err as Error).message);
}

process.exit(ok ? 0 : 1);
