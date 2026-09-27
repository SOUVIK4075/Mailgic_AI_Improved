import type { DocumentStatus } from '../types';

const STYLES: Record<DocumentStatus, { dot: string; text: string; label: string }> = {
  pending: { dot: 'bg-faint', text: 'text-muted', label: 'Queued' },
  processing: { dot: 'bg-amber-500 animate-pulse', text: 'text-muted', label: 'Reading…' },
  ready: { dot: 'bg-accent', text: 'text-accent', label: 'Ready' },
  failed: { dot: 'bg-danger', text: 'text-danger', label: 'Failed' },
};

export default function StatusBadge({ status }: { status: DocumentStatus }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
