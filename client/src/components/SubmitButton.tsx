import type { ReactNode } from 'react';
import Spinner from './Spinner';

type SubmitButtonProps = { loading: boolean; loadingText: string; children: ReactNode; disabled?: boolean; full?: boolean };

/** The primary form button. Shows a spinner and different text while the request runs. */
export default function SubmitButton({ loading, loadingText, children, disabled = false, full = true }: SubmitButtonProps) {
  return (
    <button type="submit" disabled={loading || disabled} className={`btn ${full ? 'w-full' : ''}`}>
      {loading && <Spinner className="h-4 w-4 border-white" />}
      {loading ? loadingText : children}
    </button>
  );
}
