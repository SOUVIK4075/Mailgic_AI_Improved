import type { ReactNode } from 'react';

type NoticeProps = {
  kind?: 'error' | 'success' | 'info';
  children: ReactNode;
  onClose?: () => void;
};

const STYLES = {
  error: 'border-danger/25 bg-danger-soft text-danger',
  success: 'border-accent/25 bg-accent-soft text-accent-dark',
  info: 'border-line bg-sheet text-ink',
};

/** A small inline message box. Used instead of a toast library. */
export default function Notice({ kind = 'info', children, onClose }: NoticeProps) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-4 rounded-md border px-3.5 py-2.5 text-sm ${STYLES[kind]}`}>
      <div>{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
}
