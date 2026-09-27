import { formatDate, formatDateTime } from '../lib/format';
import type { Reminder } from '../types';

/** What a finished reminder shows instead of a due time. */
function pastStatus(r: Reminder): { text: string; className: string } {
  if (r.status === 'sent') return { text: `Sent · ${formatDate(r.sentAt ?? r.dueAt)}`, className: 'text-accent' };
  if (r.status === 'failed') return { text: `Failed · ${formatDate(r.dueAt)}`, className: 'text-danger' };
  return { text: `Cancelled · was due ${formatDate(r.dueAt)}`, className: 'text-faint' };
}

type ReminderItemProps = { reminder: Reminder; onCancel?: (id: string) => void };

/** One row on the Reminders page. Upcoming rows get a Cancel button, past rows show what happened. */
export default function ReminderItem({ reminder, onCancel }: ReminderItemProps) {
  const upcoming = reminder.status === 'scheduled';
  const past = upcoming ? null : pastStatus(reminder);

  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className={`truncate font-serif text-[17px] font-medium ${upcoming ? '' : 'text-muted'}`}>{reminder.emailSubject}</p>
        {reminder.recipient && <p className="mt-0.5 truncate text-xs text-accent">→ {reminder.recipient}</p>}
        {reminder.note && <p className="mt-1 text-sm text-muted">{reminder.note}</p>}
      </div>

      {upcoming ? (
        <div className="shrink-0 text-right">
          <time dateTime={reminder.dueAt} className="block font-mono text-xs text-muted">
            {formatDateTime(reminder.dueAt)}
          </time>
          {onCancel && (
            <button type="button" onClick={() => onCancel(reminder.id)} className="mt-1.5 text-sm text-muted hover:text-danger">
              Cancel
            </button>
          )}
        </div>
      ) : (
        past && <span className={`shrink-0 font-mono text-xs ${past.className}`}>{past.text}</span>
      )}
    </li>
  );
}
