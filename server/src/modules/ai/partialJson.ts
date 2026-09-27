/**
 * Read a string field out of JSON that is still arriving, e.g.
 *   readPartialString('{"subject": "Hi", "body": "Dear Ra', 'body')  ->  'Dear Ra'
 *
 * JSON.parse can't handle half a document, and the email body is what the user wants to see
 * while it's being written. This walks the characters after `"body": "` and decodes JSON escapes
 * (\n, \", é …) until the closing quote — or until the text runs out.
 */
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };

export function readPartialString(json: string, key: string): string {
  const start = new RegExp(`"${key}"\\s*:\\s*"`).exec(json);
  if (!start) return '';

  let out = '';
  let i = start.index + start[0].length;
  while (i < json.length) {
    const c = json[i]!;
    if (c === '"') break; // closing quote: the field is complete
    if (c !== '\\') {
      out += c;
      i += 1;
      continue;
    }
    const next = json[i + 1];
    if (next === undefined) break; // escape cut in half — wait for more text
    if (next === 'u') {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 6;
      continue;
    }
    out += ESCAPES[next] ?? next;
    i += 2;
  }
  return out;
}
