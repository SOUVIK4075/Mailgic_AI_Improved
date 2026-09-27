import { useRef, useState, type FormEvent } from 'react';
import { ExternalLink, Mail, Pencil, RotateCcw, Eye } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { emailAsText, gmailComposeLink, isValidRecipientList, mailtoLink } from '../lib/format';
import { fillPlaceholder, findPlaceholders, placeholderLabel } from '../lib/placeholders';
import type { Email } from '../types';
import CopyButton from './CopyButton';
import FollowUpReminder from './FollowUpReminder';
import Letter from './Letter';
import Notice from './Notice';
import Spinner from './Spinner';

type ReviewAndSendProps = {
  email: Email; // the draft as the server returned it (parent remounts this with key={email.id})
  defaultTo?: string;
  toHint?: string;
  regenerating: boolean;
  onRegenerate: () => void;
  onStartOver: () => void;
};

/**
 * Last wizard step: fill in the [blanks], optionally edit, add the recipient, then open Gmail
 * with everything pre-filled. The final version is also saved to history (PATCH /emails/:id).
 */
export default function ReviewAndSend({ email, defaultTo = '', toHint, regenerating, onRegenerate, onStartOver }: ReviewAndSendProps) {
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [editing, setEditing] = useState(false);
  const [fills, setFills] = useState<Record<string, string>>({});
  const [to, setTo] = useState(defaultTo);
  const [toError, setToError] = useState('');
  const [warnBlanks, setWarnBlanks] = useState(false);
  const [opened, setOpened] = useState(false);
  const [saveError, setSaveError] = useState('');
  const firstBlankRef = useRef<HTMLInputElement>(null);

  // Worked out from the current text, so manual edits that remove a placeholder count too.
  const blanks = findPlaceholders(subject, body);
  const edited = subject !== email.subject || body !== email.body;

  function applyFill(placeholder: string) {
    const value = fills[placeholder]?.trim();
    if (!value) return;
    setSubject((s) => fillPlaceholder(s, placeholder, value));
    setBody((b) => fillPlaceholder(b, placeholder, value));
    setFills(({ [placeholder]: _done, ...rest }) => rest);
  }

  function handleRegenerate() {
    if (edited && !confirm('A new version will replace your edits. Continue?')) return;
    onRegenerate();
  }

  function openGmail(e?: FormEvent, skipBlankCheck = false) {
    e?.preventDefault();
    const recipients = to.trim();
    if (!isValidRecipientList(recipients)) {
      setToError('Add at least one valid email address. Separate several with commas.');
      return;
    }
    setToError('');
    if (blanks.length > 0 && !skipBlankCheck) {
      setWarnBlanks(true);
      return;
    }
    setWarnBlanks(false);

    // Open the tab first, synchronously inside the click — browsers block pop-ups opened after an await.
    window.open(gmailComposeLink(recipients, subject, body), '_blank', 'noopener');
    setOpened(true);

    // Then save the final version to history in the background.
    api<{ email: Email }>(`/emails/${email.id}`, { method: 'PATCH', body: { subject, body, recipient: recipients } }).catch((err) =>
      setSaveError(`Couldn't save this version to history: ${getErrorMessage(err)}`),
    );
  }

  if (opened) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-accent/25 bg-accent-soft px-6 py-5">
          <p className="font-serif text-xl font-medium text-accent-dark">Gmail is open in a new tab.</p>
          <p className="mt-1 text-sm text-accent-dark/80">
            Everything is filled in for <span className="font-medium">{to}</span>. Check it once more and press Send there.
          </p>
        </div>
        {saveError && <Notice kind="error">{saveError}</Notice>}
        <FollowUpReminder emailId={email.id} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpened(false)} className="btn-ghost">
            Back to the draft
          </button>
          <button type="button" onClick={onStartOver} className="btn">
            Write another email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {blanks.length > 0 && (
        <section className="rounded-lg border border-marker bg-marker/25 px-5 py-4">
          <p className="font-medium">
            Fill in the blanks <span className="font-normal text-muted">· {blanks.length} left</span>
          </p>
          <p className="hint mt-0.5">Mailgic didn't know these. Type the real value and press Enter.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {blanks.map((p, i) => (
              <label key={p} className="block">
                <span className="mb-1 block text-xs text-muted">{placeholderLabel(p)}</span>
                <input
                  ref={i === 0 ? firstBlankRef : undefined}
                  value={fills[p] ?? ''}
                  onChange={(e) => setFills({ ...fills, [p]: e.target.value })}
                  onBlur={() => applyFill(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyFill(p);
                    }
                  }}
                  placeholder={placeholderLabel(p)}
                  className="field py-2"
                />
              </label>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="meta">{editing ? 'Editing' : 'Your draft'}</p>
          <button type="button" onClick={() => setEditing(!editing)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            {editing ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {editing ? 'Preview' : 'Edit text'}
          </button>
        </div>

        {editing ? (
          <div className="space-y-3 rounded-lg border border-line bg-sheet p-4">
            <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="field font-serif text-lg" />
            <textarea
              aria-label="Email body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.max(10, body.split('\n').length + 2)}
              className="field resize-y font-serif text-[16px] leading-[1.7]"
            />
          </div>
        ) : (
          <Letter subject={subject} body={body} sources={email.sources} faded={regenerating} />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CopyButton text={emailAsText(subject, body)} />
          <button type="button" onClick={handleRegenerate} disabled={regenerating} className="btn-ghost">
            {regenerating ? <Spinner className="h-4 w-4 border-muted" /> : <RotateCcw className="h-4 w-4" strokeWidth={1.75} />}
            Try another version
          </button>
          <span className="ml-auto font-mono text-xs text-faint">{body.trim().split(/\s+/).length} words</span>
        </div>
      </section>

      <form onSubmit={(e) => openGmail(e)} className="rounded-lg border border-line bg-sheet p-5" noValidate>
        <label htmlFor="to" className="label">
          Send to
        </label>
        <input
          id="to"
          type="text"
          inputMode="email"
          autoComplete="email"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setToError('');
          }}
          placeholder="name@company.com"
          className="field"
        />
        <p className={`mt-1.5 text-xs ${toError ? 'text-danger' : 'text-muted'}`}>
          {toError || toHint || 'Several people? Separate the addresses with commas.'}
        </p>

        {warnBlanks && (
          <div role="alert" className="mt-4 rounded-md border border-marker bg-marker/30 px-4 py-3 text-sm">
            <p>
              {blanks.length === 1 ? 'One blank is' : `${blanks.length} blanks are`} still empty: {blanks.join(', ')}. Send it like this?
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className="font-medium text-accent hover:underline"
                onClick={() => {
                  setWarnBlanks(false);
                  firstBlankRef.current?.focus();
                }}
              >
                Fill them first
              </button>
              <button type="button" className="text-muted hover:text-ink" onClick={() => openGmail(undefined, true)}>
                Open Gmail anyway
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn">
            <ExternalLink className="h-4 w-4" /> Open in Gmail
          </button>
          <a href={mailtoLink(subject, body, to.trim())} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <Mail className="h-4 w-4" strokeWidth={1.75} /> Use another mail app
          </a>
        </div>
      </form>
    </div>
  );
}
