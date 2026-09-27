import { Link } from 'react-router-dom';

type KnowledgeCheckboxProps = { checked: boolean; onChange: (checked: boolean) => void };

export default function KnowledgeCheckbox({ checked, onChange }: KnowledgeCheckboxProps) {
  return (
    <label className="flex items-start gap-2.5 rounded-md border border-line bg-sheet px-3 py-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
      <span>
        Check my documents for facts
        <span className="block text-xs text-muted">
          Uses what you've added under <Link to="/app/knowledge" className="link">Knowledge</Link>.
        </span>
      </span>
    </label>
  );
}
