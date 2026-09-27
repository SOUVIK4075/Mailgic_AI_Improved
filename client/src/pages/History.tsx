import { useEffect, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import HistoryItem from '../components/HistoryItem';
import Notice from '../components/Notice';
import Spinner from '../components/Spinner';
import { useMeta } from '../hooks/useMeta';
import { api, getErrorMessage } from '../lib/api';
import type { ClearHistoryResponse, Email, EmailListResponse, MatchedBy, SearchResponse, SearchResult } from '../types';

const PAGE_SIZE = 20;

type ModeFilter = '' | 'compose' | 'reply'; // '' = all

function buildQuery(mode: ModeFilter, type: string, cursor: string | null): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (mode) params.set('mode', mode);
  if (type) params.set('type', type);
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

const selectClass = 'field w-auto py-1.5 text-sm';

const SEARCH_MIN_CHARS = 2; // same limits as the server
const SEARCH_MAX_CHARS = 200;

function matchLabel(matchedBy: MatchedBy[]): string {
  const words = matchedBy.includes('keyword');
  const meaning = matchedBy.includes('meaning');
  if (words && meaning) return 'matched by words & meaning';
  return words ? 'matched by words' : 'matched by meaning';
}

type SearchState = { q: string; items: SearchResult[] };

export default function History() {
  const { meta } = useMeta();
  const [mode, setMode] = useState<ModeFilter>('');
  const [type, setType] = useState('');
  const [items, setItems] = useState<Email[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [query, setQuery] = useState(''); // what's typed in the search box
  const [search, setSearch] = useState<SearchState | null>(null); // null = not searching, show the normal list
  const [searching, setSearching] = useState(false);

  // Load the first page whenever a filter changes (this also resets the list).
  useEffect(() => {
    let ignore = false; // ignore responses from an older filter if the user changed it quickly
    setLoading(true);
    setError('');
    api<EmailListResponse>(`/emails?${buildQuery(mode, type, null)}`)
      .then((data) => {
        if (ignore) return;
        setItems(data.items);
        setNextCursor(data.nextCursor);
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
  }, [mode, type]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await api<EmailListResponse>(`/emails?${buildQuery(mode, type, nextCursor)}`);
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      setError(`Type at least ${SEARCH_MIN_CHARS} characters to search.`);
      return;
    }
    setSearching(true);
    setError('');
    try {
      const data = await api<SearchResponse>(`/emails/search?${new URLSearchParams({ q, limit: String(PAGE_SIZE) })}`);
      setSearch({ q, items: data.items });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearch(null);
    setQuery('');
  }

  async function handleDelete(id: string) {
    try {
      await api<void>(`/emails/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((email) => email.id !== id));
      setSearch((s) => (s ? { ...s, items: s.items.filter((email) => email.id !== id) } : s));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleClearAll() {
    if (!confirm('Delete ALL of your saved emails? This cannot be undone.')) return;
    try {
      const data = await api<ClearHistoryResponse>('/emails', { method: 'DELETE' });
      setItems([]);
      setNextCursor(null);
      setNotice(`Deleted ${data.deletedCount} email${data.deletedCount === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function typeLabel(email: Email): string {
    if (email.mode === 'reply') return 'Reply';
    return meta?.emailTypes.find((t) => t.id === email.type)?.label ?? email.type ?? '';
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">History</h1>
          <p className="mt-1 text-muted">Everything you've drafted, newest first.</p>
        </div>

        {/* Filters are sent to the server as query params. They don't apply to search. */}
        <div className={`flex flex-wrap items-center gap-2 ${search ? 'hidden' : ''}`}>
          <select
            aria-label="Filter by mode"
            value={mode}
            onChange={(e) => {
              const value = e.target.value as ModeFilter;
              setMode(value);
              if (value === 'reply') setType(''); // replies have no email type
            }}
            className={selectClass}
          >
            <option value="">New emails &amp; replies</option>
            <option value="compose">Only new emails</option>
            <option value="reply">Only replies</option>
          </select>
          <select aria-label="Filter by kind" value={type} onChange={(e) => setType(e.target.value)} disabled={mode === 'reply'} className={`${selectClass} disabled:opacity-50`}>
            <option value="">Any kind</option>
            {meta?.emailTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <form onSubmit={handleSearch} className="flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" strokeWidth={1.75} />
          <input
            type="search"
            aria-label="Search your emails"
            value={query}
            maxLength={SEARCH_MAX_CHARS}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your emails…"
            className="field pl-9"
          />
        </div>
        <button type="submit" disabled={searching} className="btn-ghost">
          {searching && <Spinner className="h-4 w-4 border-muted" />}
          Search
        </button>
      </form>

      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      {notice && <Notice kind="success" onClose={() => setNotice('')}>{notice}</Notice>}

      {search ? (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <p className="text-sm text-muted">
              {search.items.length} {search.items.length === 1 ? 'result' : 'results'} for “{search.q}”, best match first
            </p>
            <button type="button" onClick={clearSearch} className="link text-sm">
              Clear search
            </button>
          </div>
          {search.items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-8 py-14 text-center">
              <p className="font-serif text-xl italic text-muted">No emails matched.</p>
              <p className="mt-1 text-sm text-faint">Try other words. Very new drafts can take a few seconds to become searchable.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-sheet">
              {search.items.map((email) => (
                <HistoryItem key={email.id} email={email} typeLabel={typeLabel(email)} tag={matchLabel(email.matchedBy)} onDelete={handleDelete} />
              ))}
            </ul>
          )}
        </section>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 border-muted" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-8 py-14 text-center">
          <p className="font-serif text-xl italic text-muted">Nothing here yet.</p>
          <p className="mt-1 text-sm text-faint">Drafts you write are saved here automatically.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-sheet">
          {items.map((email) => (
            <HistoryItem key={email.id} email={email} typeLabel={typeLabel(email)} onDelete={handleDelete} />
          ))}
        </ul>
      )}

      <div className={`flex items-center justify-between ${search ? 'hidden' : ''}`}>
        {!loading && nextCursor ? (
          <button type="button" onClick={loadMore} disabled={loadingMore} className="btn-ghost">
            {loadingMore && <Spinner className="h-4 w-4 border-muted" />}
            Show older
          </button>
        ) : (
          <span />
        )}
        {items.length > 0 && (
          <button type="button" onClick={handleClearAll} className="text-sm text-muted hover:text-danger">
            Delete all history
          </button>
        )}
      </div>
    </div>
  );
}
