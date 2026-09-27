type DayChartProps = { days: { date: string; count: number }[] };

const MAX_LABELS = 7; // more than this and the date labels overlap

/** "2026-09-27" → "27 Sep". Read as local midnight so the day doesn't shift across time zones. */
function shortDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Emails per day as plain CSS bars: each bar's height is its share of the busiest day. Hover for the count. */
export default function DayChart({ days }: DayChartProps) {
  const max = Math.max(1, ...days.map((d) => d.count)); // at least 1 so an all-zero range doesn't divide by 0
  const labelEvery = Math.ceil(days.length / MAX_LABELS);

  return (
    <div>
      <div className="flex h-40 items-end gap-px border-b border-line">
        {days.map((d) => (
          // The full-height wrapper is the hover target, so even a tiny bar is easy to point at.
          <div key={d.date} title={`${shortDate(d.date)}: ${d.count} ${d.count === 1 ? 'email' : 'emails'}`} className="group flex h-full flex-1 items-end">
            <div className="w-full rounded-t-sm bg-accent/80 group-hover:bg-accent-dark" style={{ height: `${(d.count / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-px">
        {days.map((d, i) => (
          <span key={d.date} className="min-w-0 flex-1 overflow-visible whitespace-nowrap font-mono text-[10px] text-faint">
            {i % labelEvery === 0 ? shortDate(d.date) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
