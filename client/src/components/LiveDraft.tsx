import { Square } from 'lucide-react';
import type { DraftPreview } from '../types';
import DraftPlaceholder from './DraftPlaceholder';
import Letter from './Letter';
import Spinner from './Spinner';

type LiveDraftProps = { preview: DraftPreview | null; onStop: () => void };

/** The draft as it is being written, with a Stop button. */
export default function LiveDraft({ preview, onStop }: LiveDraftProps) {
  return (
    <div>
      {/* Grey "lines" until the first words arrive, then the real letter growing. */}
      {preview ? <Letter subject={preview.subject} body={preview.body} sources={[]} /> : <DraftPlaceholder writing hint="" />}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={onStop} className="btn-ghost">
          <Square className="h-3.5 w-3.5" strokeWidth={2} /> Stop
        </button>
        {preview && (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-3.5 w-3.5 border-muted" /> Writing…
          </span>
        )}
      </div>
    </div>
  );
}
