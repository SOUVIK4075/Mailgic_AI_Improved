import { formatDate } from '../lib/format';
import type { KnowledgeDocument } from '../types';
import StatusBadge from './StatusBadge';

type KnowledgeItemProps = { doc: KnowledgeDocument; onDelete: (id: string) => void };

export default function KnowledgeItem({ doc, onDelete }: KnowledgeItemProps) {
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <span className="mt-0.5 w-9 shrink-0 rounded border border-line py-0.5 text-center font-mono text-[10px] uppercase text-muted">
        {doc.sourceType === 'pdf' ? 'pdf' : 'txt'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{doc.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <StatusBadge status={doc.status} />
          {doc.status === 'ready' && <span>{doc.chunkCount} {doc.chunkCount === 1 ? 'passage' : 'passages'}</span>}
          <span>Added {formatDate(doc.createdAt)}</span>
        </p>
        {doc.status === 'failed' && doc.error && <p className="mt-1 text-sm text-danger">{doc.error}</p>}
      </div>
      <button type="button" onClick={() => onDelete(doc.id)} aria-label={`Remove ${doc.title}`} className="text-sm text-muted hover:text-danger">
        Remove
      </button>
    </li>
  );
}
