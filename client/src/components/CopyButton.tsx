import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type CopyButtonProps = { text: string; label?: string; className?: string };

export default function CopyButton({ text, label = 'Copy', className = 'btn-ghost' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Could not copy to clipboard.');
    }
  }

  return (
    <button type="button" onClick={handleCopy} className={className} aria-label={label || 'Copy'}>
      {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
      {label && <span>{copied ? 'Copied' : label}</span>}
    </button>
  );
}
