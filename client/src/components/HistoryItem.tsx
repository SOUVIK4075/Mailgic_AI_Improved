import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { emailAsText, formatDate } from '../lib/format';
import type { Email } from '../types';
import CopyButton from './CopyButton';

type HistoryItemProps = {
  email: Email;
  typeLabel: string;
  tag?: string; // small extra label, e.g. "matched by meaning" in search results
  onDelete: (id: string) => void;
};

/** One row in the history list, inbox-style. Click to read the full email. */
export default function HistoryItem({ email, typeLabel, tag, onDelete }: HistoryItemProps) {
  const [expanded, setExpanded] = useState(false);
  const preview = email.body.replace(/\s+/g, ' ').slice(0, 140);

  return (
    <li>
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-paper/60">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="meta">{typeLabel}</span>
            <span className="text-faint">·</span>
            <span className="meta normal-case tracking-normal">{email.tone}</span>
            {tag && <span className="shrink-0 rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-muted">{tag}</span>}
            {email.recipient && (
              <span className="truncate text-xs text-accent" title="Opened in Gmail for this address">
                → {email.recipient}
              </span>
            )}
          </div>
          <p className="mt-1 truncate font-serif text-[17px] font-medium">{email.subject}</p>
          {!expanded && <p className="mt-0.5 truncate text-sm text-muted">{preview}</p>}
        </div>
        <time dateTime={email.createdAt} className="shrink-0 font-mono text-xs text-faint">
          {formatDate(email.createdAt)}
        </time>
      </button>

      {expanded && (
        <div className="space-y-4 px-5 pb-5">
          {email.mode === 'reply' && email.incomingEmail && (
            <details className="rounded-md bg-paper px-4 py-3 text-sm text-muted">
              <summary className="text-ink">Their email</summary>
              <p className="mt-2 whitespace-pre-wrap font-serif">{email.incomingEmail}</p>
            </details>
          )}
          <p className="whitespace-pre-wrap font-serif text-[16px] leading-[1.7]">{email.body}</p>
          <div className="flex items-center gap-2">
            <CopyButton text={emailAsText(email.subject, email.body)} />
            <button type="button" onClick={() => onDelete(email.id)} className="btn-ghost hover:border-danger hover:text-danger">
              <Trash2 className="h-4 w-4" strokeWidth={1.75} /> Delete
            </button>
            <span className="ml-auto font-mono text-xs text-faint">{email.wordCount} words</span>
          </div>
        </div>
      )}
    </li>
  );
}
