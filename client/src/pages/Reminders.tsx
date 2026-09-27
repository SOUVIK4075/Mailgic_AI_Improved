import { useEffect, useState } from 'react';
import Notice from '../components/Notice';
import ReminderItem from '../components/ReminderItem';
import Spinner from '../components/Spinner';
import { api, getErrorMessage } from '../lib/api';
import type { ReminderListResponse } from '../types';

export default function Reminders() {
  const [data, setData] = useState<ReminderListResponse | null>(null);
  const [error, setError] = useState('');

  function load() {
    return api<ReminderListResponse>('/reminders')
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCancel(id: string) {
    if (!confirm('Cancel this reminder?')) return;
    try {
      await api<void>(`/reminders/${id}`, { method: 'DELETE' });
    } catch (err) {
      setError(getErrorMessage(err)); // e.g. REMINDER_NOT_SCHEDULED: it was sent in the meantime
    }
    await load(); // either way, show the server's current state (it moves to "Past")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-medium tracking-tight">Reminders</h1>
        <p className="mt-1 text-muted">Follow-ups you asked for after sending. Mailgic emails you when each one is due.</p>
      </header>

      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}

      {!data ? (
        !error && (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 border-muted" />
          </div>
        )
      ) : (
        <>
          <section>
            <p className="meta mb-2">Upcoming · {data.upcoming.length}</p>
            {data.upcoming.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line px-8 py-14 text-center">
                <p className="font-serif text-xl italic text-muted">Nothing scheduled.</p>
                <p className="mt-1 text-sm text-faint">After you open a draft in Gmail, you can ask to be reminded to follow up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-sheet">
                {data.upcoming.map((r) => (
                  <ReminderItem key={r.id} reminder={r} onCancel={handleCancel} />
                ))}
              </ul>
            )}
          </section>

          {data.past.length > 0 && (
            <section>
              <p className="meta mb-2">Past</p>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-sheet/60">
                {data.past.map((r) => (
                  <ReminderItem key={r.id} reminder={r} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
