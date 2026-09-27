import type { ReactNode } from 'react';

type TabButtonProps = { active: boolean; onClick: () => void; children: ReactNode };

/** One segment of a small segmented control (e.g. "Upload a file / Paste text"). */
export default function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm transition-colors ${active ? 'bg-sheet font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink'}`}
    >
      {children}
    </button>
  );
}
