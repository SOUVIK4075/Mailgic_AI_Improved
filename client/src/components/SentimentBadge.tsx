import type { Sentiment } from '../types';

const STYLES: Record<Sentiment, string> = {
  positive: 'bg-accent-soft text-accent-dark',
  neutral: 'bg-line/60 text-muted',
  negative: 'bg-danger-soft text-danger',
  urgent: 'bg-marker text-ink',
};

export default function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider ${STYLES[sentiment]}`}>{sentiment}</span>;
}
