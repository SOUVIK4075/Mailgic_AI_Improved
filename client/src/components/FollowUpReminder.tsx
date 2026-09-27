import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api, ApiError, getErrorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { Reminder, ReminderResponse } from '../types';
import CharCounter from './CharCounter';
import Notice from './Notice';
import Spinner from './Spinner';

type Choice = '2d' | '1w' | 'custom';

const CHOICES: { id: Choice; label: string }[] = [
  { id: '2d', label: 'In 2 days' },
  { id: '1w', label: 'In 1 week' },
  { id: 'custom', label: 'Pick a date & time' },
];
const PRESET_DAYS = { '2d': 2, '1w': 7 };
const NOTE_MAX_CHARS = 200;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** `days` from today at 9:00 am in the user's own time zone. */
function daysFromNowAt9(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}

/** Shown after Gmail opens: "email me in N days so I remember to follow up". */
export default function FollowUpReminder({ emailId }: { emailId: string }) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [customValue, setCustomValue] = useState(''); // "2026-09-29T09:00" from <input type="datetime-local">, local time
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);

  // `new Date("2026-09-29T09:00")` (no time zone) is read as local time, which is what the user picked.
  let dueAt: Date | null = null;
  if (choice === 'custom') dueAt = customValue ? new Date(customValue) : null;
  else if (choice) dueAt = daysFromNowAt9(PRESET_DAYS[choice]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dueAt) {
      setError('Pick when you want to be reminded.');
      return;
    }
    // Same range the server accepts.
    const msFromNow = dueAt.getTime() - Date.now();
    if (msFromNow < 5 * MINUTE_MS || msFromNow > 90 * DAY_MS) {
      setError('Pick a time between 5 minutes and 90 days from now.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const body: { emailId: string; dueAt: string; note?: string } = { emailId, dueAt: dueAt.toISOString() };
      if (note.trim()) body.note = note.trim();
      const data = await api<ReminderResponse>('/reminders', { method: 'POST', body });
      setReminder(data.reminder);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REMINDER_EXISTS') setAlreadyExists(true);
      else setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (reminder || alreadyExists) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-line bg-sheet px-5 py-4 text-sm">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
        <p>
          {reminder
            ? `I'll email you on ${formatDateTime(reminder.dueAt)}.`
            : 'This email already has a follow-up reminder.'}{' '}
          <Link to="/app/reminders" className="link">
            See your reminders
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-sheet p-5" noValidate>
      <p className="font-serif text-lg font-medium">Remind me to follow up</p>
      <p className="hint mt-0.5">Mailgic will email you a nudge on the day, in case they haven't replied.</p>

      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="When">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={choice === c.id}
            onClick={() => {
              setChoice(c.id);
              setError('');
            }}
            className={`rounded-full border px-3 py-1 text-sm ${
              choice === c.id ? 'border-accent bg-accent text-white' : 'border-line bg-sheet hover:border-muted'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {choice === 'custom' && (
        <input
          type="datetime-local"
          aria-label="Reminder date and time"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          className="field mt-3 w-auto"
        />
      )}
      {choice && choice !== 'custom' && dueAt && <p className="meta mt-3 normal-case tracking-normal">{formatDateTime(dueAt)}</p>}

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="reminder-note" className="text-sm font-medium">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <CharCounter length={note.length} max={NOTE_MAX_CHARS} />
        </div>
        <input
          id="reminder-note"
          value={note}
          maxLength={NOTE_MAX_CHARS}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. ask if the invoice went through"
          className="field"
        />
      </div>

      {error && (
        <div className="mt-4">
          <Notice kind="error" onClose={() => setError('')}>
            {error}
          </Notice>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="btn-ghost">
          {saving ? <Spinner className="h-4 w-4 border-muted" /> : <Bell className="h-4 w-4" strokeWidth={1.75} />}
          Set reminder
        </button>
        <Link to="/app/reminders" className="text-sm text-muted hover:text-ink">
          All reminders
        </Link>
      </div>
    </form>
  );
}
