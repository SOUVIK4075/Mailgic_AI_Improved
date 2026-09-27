import { useEffect, useState } from 'react';
import KnowledgeItem from '../components/KnowledgeItem';
import KnowledgeUpload from '../components/KnowledgeUpload';
import Notice from '../components/Notice';
import Spinner from '../components/Spinner';
import { useMeta } from '../hooks/useMeta';
import { api, getErrorMessage } from '../lib/api';
import type { KnowledgeDocument, KnowledgeListResponse } from '../types';

const POLL_INTERVAL_MS = 3000;

async function fetchDocuments(): Promise<KnowledgeDocument[]> {
  const data = await api<KnowledgeListResponse>('/knowledge');
  return data.items;
}

export default function Knowledge() {
  const { meta } = useMeta();
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Initial load
  useEffect(() => {
    fetchDocuments()
      .then(setDocs)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  // Poll only while at least one document is still being processed on the server.
  // When `hasPending` flips to false (or the page unmounts) the cleanup clears the interval.
  const hasPending = docs.some((d) => d.status === 'pending' || d.status === 'processing');
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => {
      fetchDocuments()
        .then(setDocs)
        .catch(() => {}); // a failed poll is not worth an error message; the next tick retries
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasPending]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this document from your knowledge base?')) return;
    try {
      await api<void>(`/knowledge/${id}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-medium tracking-tight">Knowledge</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Things Mailgic is allowed to quote: your resume, a price list, a refund policy. When you tick “Check my
          documents”, it looks here first and tells you which passage it used. If the answer isn't here, it leaves a
          placeholder instead of guessing.
        </p>
      </header>

      {meta && <KnowledgeUpload maxUploadMb={meta.limits.maxUploadMb} maxTextChars={meta.limits.knowledgeTextMaxChars} onUploaded={(doc) => setDocs((prev) => [doc, ...prev])} />}

      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 border-muted" />
        </div>
      ) : docs.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">No documents yet.</p>
      ) : (
        <section>
          <p className="meta mb-2">Your documents · {docs.length}</p>
          <ul className="divide-y divide-line rounded-lg border border-line bg-sheet">
            {docs.map((doc) => (
              <KnowledgeItem key={doc.id} doc={doc} onDelete={handleDelete} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
