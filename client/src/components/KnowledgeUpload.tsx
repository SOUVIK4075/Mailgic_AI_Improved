import { useState, type FormEvent } from 'react';
import { api, getErrorMessage } from '../lib/api';
import type { KnowledgeDocument, KnowledgeUploadResponse } from '../types';
import Notice from './Notice';
import SubmitButton from './SubmitButton';
import TabButton from './TabButton';

type KnowledgeUploadProps = {
  maxUploadMb: number;
  maxTextChars: number;
  onUploaded: (doc: KnowledgeDocument) => void;
};

const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md'];

export default function KnowledgeUpload({ maxUploadMb, maxTextChars, onUploaded }: KnowledgeUploadProps) {
  const [source, setSource] = useState<'file' | 'text'>('file');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0); // changing the key clears the <input type="file">
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  function validateFile(f: File): string {
    const name = f.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'Only .pdf, .txt and .md files are supported.';
    if (f.size > maxUploadMb * 1024 * 1024) return `File is too large. The limit is ${maxUploadMb} MB.`;
    return '';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    let body: FormData | { title: string; text: string };
    if (source === 'file') {
      if (!file) {
        setError('Choose a file first.');
        return;
      }
      const problem = validateFile(file);
      if (problem) {
        setError(problem);
        return;
      }
      body = new FormData();
      body.append('file', file);
      if (title.trim()) body.append('title', title.trim());
    } else {
      body = { title: title.trim(), text };
    }

    setUploading(true);
    try {
      const data = await api<KnowledgeUploadResponse>('/knowledge', { method: 'POST', body });
      onUploaded(data.document);
      setTitle('');
      setText('');
      setFile(null);
      setFileInputKey((k) => k + 1);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-sheet p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">Add a document</p>
        <div role="tablist" className="inline-flex rounded-md bg-paper p-0.5">
          <TabButton active={source === 'file'} onClick={() => setSource('file')}>Upload a file</TabButton>
          <TabButton active={source === 'text'} onClick={() => setSource('text')}>Paste text</TabButton>
        </div>
      </div>

      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}

      <div>
        <label htmlFor="doc-title" className="label">
          Title {source === 'file' && <span className="font-normal text-muted">(optional — we'll use the file name)</span>}
        </label>
        <input
          id="doc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required={source === 'text'}
          placeholder={source === 'file' ? 'e.g. My resume' : 'e.g. Refund policy'}
          className="field"
        />
      </div>

      {source === 'file' ? (
        <label className="block cursor-pointer rounded-md border border-dashed border-line bg-paper/50 px-4 py-6 text-center transition-colors hover:border-muted">
          <span className="block text-sm">{file ? file.name : <><span className="link">Choose a file</span> from your computer</>}</span>
          <span className="hint mt-1 block">PDF, TXT or Markdown · up to {maxUploadMb} MB</span>
          <input
            key={fileInputKey}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          maxLength={maxTextChars}
          aria-label="Document text"
          placeholder="Paste a policy, price list, FAQ, your bio…"
          className="field h-40 resize-y"
        />
      )}

      <div className="flex justify-end">
        <SubmitButton loading={uploading} loadingText="Uploading…" full={false}>
          Add to knowledge
        </SubmitButton>
      </div>
    </form>
  );
}
