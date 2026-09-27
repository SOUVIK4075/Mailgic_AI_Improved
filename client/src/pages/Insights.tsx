import { useEffect, useState, type ReactNode } from 'react';
import BarList from '../components/BarList';
import DayChart from '../components/DayChart';
import Notice from '../components/Notice';
import Spinner from '../components/Spinner';
import TabButton from '../components/TabButton';
import { api, getErrorMessage } from '../lib/api';
import type { Insights as InsightsData, InsightsDays } from '../types';

const RANGES: InsightsDays[] = [7, 30, 90];

/** The user's own time zone (e.g. "Asia/Kolkata"), so "per day" means their days, not UTC days. */
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const formatNumber = (n: number) => n.toLocaleString('en-GB');

/** Share of all emails, as a whole percent. 0 when there are no emails yet. */
const percentOf = (part: number, total: number) => (total === 0 ? '0%' : `${Math.round((part / total) * 100)}%`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-serif text-3xl font-medium tracking-tight">{value}</p>
      <p className="meta mt-1">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-sheet px-6 py-5">
      <h2 className="mb-4 font-serif text-xl font-medium">{title}</h2>
      {children}
    </section>
  );
}

export default function Insights() {
  const [days, setDays] = useState<InsightsDays>(30);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false; // ignore an older response if the user switched range quickly
    setLoading(true);
    setError('');
    api<InsightsData>(`/insights?${new URLSearchParams({ days: String(days), tz: TIME_ZONE })}`)
      .then((d) => {
        if (!ignore) setData(d);
      })
      .catch((err) => {
        if (!ignore) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [days]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">Insights</h1>
          <p className="mt-1 text-muted">What you've been writing in the last {days} days.</p>
        </div>
        <div role="tablist" aria-label="Time range" className="inline-flex rounded-md bg-line/50 p-0.5">
          {RANGES.map((r) => (
            <TabButton key={r} active={days === r} onClick={() => setDays(r)}>
              {r} days
            </TabButton>
          ))}
        </div>
      </header>

      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}

      {!data ? (
        loading && (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 border-muted" />
          </div>
        )
      ) : (
        // Keep the old numbers on screen (faded) while a new range loads, instead of flashing a spinner.
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <InsightsBody data={data} />
        </div>
      )}
    </div>
  );
}

function InsightsBody({ data }: { data: InsightsData }) {
  const { totals, ai } = data;

  return (
    <>
      <div className="grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Emails" value={formatNumber(totals.emails)} />
        <Stat label="Replies" value={formatNumber(totals.replies)} />
        <Stat label="Sent via Gmail" value={formatNumber(totals.sentViaGmail)} />
        <Stat label="Avg words" value={formatNumber(Math.round(totals.avgWords))} />
        <Stat label="Had blanks" value={percentOf(totals.withPlaceholders, totals.emails)} />
        <Stat label="Used knowledge" value={percentOf(totals.usedKnowledge, totals.emails)} />
      </div>

      {totals.emails === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-8 py-14 text-center">
          <p className="font-serif text-xl italic text-muted">Nothing written in this period.</p>
          <p className="mt-1 text-sm text-faint">Draft a few emails and the charts will fill in.</p>
        </div>
      ) : (
        <>
          <Section title="Per day">
            <DayChart days={data.perDay} />
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="By kind">
              <BarList items={data.byType.map((t) => ({ label: t.label, count: t.count }))} empty="No new emails, only replies." />
            </Section>
            <Section title="By tone">
              <BarList items={data.byTone.map((t) => ({ label: t.label, count: t.count }))} />
            </Section>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Top recipients">
              <BarList items={data.topRecipients.map((r) => ({ label: r.address, count: r.count }))} empty="Nothing opened in Gmail yet." />
            </Section>
            <Section title="AI usage">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Prompt tokens</dt>
                  <dd className="font-mono">{formatNumber(ai.promptTokens)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Completion tokens</dt>
                  <dd className="font-mono">{formatNumber(ai.completionTokens)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-line pt-3">
                  <dt className="text-muted">Average time per draft</dt>
                  <dd className="font-mono">{(ai.avgLatencyMs / 1000).toFixed(1)} s</dd>
                </div>
              </dl>
            </Section>
          </div>
        </>
      )}
    </>
  );
}
