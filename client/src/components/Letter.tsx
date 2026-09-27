import type { Source } from '../types';
import { PLACEHOLDER } from '../lib/placeholders';

/** Text with every [placeholder] highlighted like a marker pen. */
export function WithMarks({ text }: { text: string }) {
  return (
    <>
      {text.split(PLACEHOLDER).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[3px] bg-marker px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

type LetterProps = { subject: string; body: string; sources: Source[]; faded?: boolean };

/** A draft shown as a sheet of paper, with knowledge-base sources as footnotes. */
export default function Letter({ subject, body, sources, faded = false }: LetterProps) {
  return (
    <article className={`rounded-lg border border-line bg-sheet shadow-[0_18px_40px_-28px_rgba(31,29,26,0.35)] ${faded ? 'opacity-40' : ''}`}>
      <div className="flex items-baseline gap-3 border-b border-line px-6 py-4 sm:px-8">
        <span className="meta shrink-0">Subject</span>
        <h3 className="font-serif text-lg font-medium leading-snug">
          <WithMarks text={subject} />
        </h3>
      </div>

      <p className="whitespace-pre-wrap px-6 py-6 font-serif text-[17px] leading-[1.7] sm:px-8">
        <WithMarks text={body} />
      </p>

      {sources.length > 0 && (
        <footer className="border-t border-dashed border-line px-6 py-4 sm:px-8">
          <p className="meta mb-2">Taken from your documents</p>
          <ol className="space-y-2 text-sm">
            {sources.map((s, i) => (
              <li key={`${s.documentId}-${s.chunkIndex}`} className="flex gap-2">
                <span className="font-mono text-xs text-faint">{i + 1}.</span>
                <span>
                  <span className="font-medium">{s.title}</span>
                  <span className="text-muted"> — “{s.excerpt.trim()}…”</span>
                </span>
              </li>
            ))}
          </ol>
        </footer>
      )}
    </article>
  );
}
