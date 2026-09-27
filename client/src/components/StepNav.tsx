import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

/** Back link on the left, the step's main action on the right. */
export default function StepNav({ onBack, children }: { onBack?: () => void; children?: ReactNode }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-5">
      {onBack ? (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      ) : (
        <span />
      )}
      {children}
    </div>
  );
}
