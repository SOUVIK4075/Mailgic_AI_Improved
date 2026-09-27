import { env } from '../../config/env.js';
import { RAG } from '../../config/constants.js';
import { openai } from './openai.js';

// Turns text into vectors. Similar meaning => vectors close together (cosine similarity).
// Inputs are sent in batches: one API call for 64 chunks is much faster and cheaper than 64 calls.
export async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; tokens: number }> {
  const vectors: number[][] = [];
  let tokens = 0;

  for (let i = 0; i < texts.length; i += RAG.embedBatchSize) {
    const batch = texts.slice(i, i + RAG.embedBatchSize);
    const res = await openai.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: batch,
      dimensions: env.EMBEDDING_DIMENSIONS,
    });
    // The API returns results with an `index`; sort to be safe so vectors line up with inputs.
    res.data.sort((a, b) => a.index - b.index).forEach((d) => vectors.push(d.embedding));
    // The vector index is built for exactly EMBEDDING_DIMENSIONS. A mismatch (e.g. after switching
    // provider/model) would make search silently fail, so stop with a clear message instead.
    const got = res.data[0]?.embedding.length;
    if (got !== env.EMBEDDING_DIMENSIONS) {
      throw new Error(`Embedding model returned ${got} dimensions but EMBEDDING_DIMENSIONS=${env.EMBEDDING_DIMENSIONS}`);
    }
    tokens += res.usage?.total_tokens ?? 0; // some providers (e.g. Gemini) omit usage for embeddings
  }

  return { vectors, tokens };
}

export async function embedQuery(text: string): Promise<number[]> {
  const { vectors } = await embedTexts([text]);
  return vectors[0]!;
}
