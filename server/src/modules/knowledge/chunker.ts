/**
 * Split text into overlapping chunks of roughly `size` characters.
 *
 * Why chunk at all? Embeddings work best on focused passages, and we only want to send the
 * few relevant passages to the LLM — not a whole 20-page PDF (cost + worse answers).
 * Why overlap? So a sentence that falls on a boundary still appears whole in one chunk.
 *
 * We prefer to cut at a paragraph break, then a sentence end, then a space — so chunks
 * don't end mid-word — but never earlier than half the chunk size.
 */
export function chunkText(text: string, size: number, overlap: number): string[] {
  const clean = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);

    if (end < clean.length) {
      const window = clean.slice(start, end);
      const minCut = Math.floor(size / 2);
      for (const boundary of ['\n\n', '. ', '\n', ' ']) {
        const at = window.lastIndexOf(boundary);
        if (at >= minCut) {
          end = start + at + boundary.length;
          break;
        }
      }
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;

    // Step back by `overlap`, then forward to the next space so the next chunk starts on a word.
    let next = Math.max(end - overlap, start + 1);
    const space = clean.indexOf(' ', next);
    if (space !== -1 && space < end) next = space + 1;
    start = next;
  }

  return chunks;
}
