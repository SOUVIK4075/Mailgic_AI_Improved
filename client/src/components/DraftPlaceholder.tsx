/** What the right-hand column shows before there is a draft, or while one is being written. */
export default function DraftPlaceholder({ writing, hint }: { writing: boolean; hint: string }) {
  if (writing) {
    return (
      <div className="rounded-lg border border-line bg-sheet px-8 py-7" aria-busy="true">
        <p className="meta mb-6">Writing…</p>
        {/* Rough "lines of text" while we wait — calmer than a big spinner. */}
        <div className="space-y-3">
          {[92, 100, 85, 97, 60].map((w, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-line/70" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-72 flex-col justify-center rounded-lg border border-dashed border-line px-8 py-10">
      <p className="font-serif text-xl italic text-muted">Your draft will show up here.</p>
      <p className="mt-2 max-w-sm text-sm text-faint">{hint}</p>
    </div>
  );
}
