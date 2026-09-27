type BarListProps = { items: { label: string; count: number }[]; empty?: string };

/** A ranked list with a thin bar under each row, as long as its share of the biggest count. */
export default function BarList({ items, empty = 'Nothing yet.' }: BarListProps) {
  if (items.length === 0) return <p className="text-sm text-faint">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="font-mono text-xs text-muted">{item.count}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-line/60">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
