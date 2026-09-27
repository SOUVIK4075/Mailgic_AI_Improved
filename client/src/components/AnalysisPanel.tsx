import type { ReplyAnalysis } from '../types';
import SentimentBadge from './SentimentBadge';

function Checklist({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="meta mb-1.5">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm">
            <span className="text-accent">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What Mailgic understood about the incoming email — shown above the reply so the user can sanity-check it. */
export default function AnalysisPanel({ analysis }: { analysis: ReplyAnalysis }) {
  return (
    <section className="rounded-lg border border-line bg-sheet/60 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{analysis.senderName ?? 'The sender'}</span>
          <span className="text-muted"> — {analysis.intent}</span>
        </p>
        <SentimentBadge sentiment={analysis.sentiment} />
      </div>
      <p className="mt-2 text-sm text-muted">{analysis.summary}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Checklist title="Questions answered" items={analysis.questions} />
        <Checklist title="Asks" items={analysis.requestedActions} />
        <Checklist title="Deadlines" items={analysis.deadlines} />
      </div>
    </section>
  );
}
