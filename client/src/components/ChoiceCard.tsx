type ChoiceCardProps = {
  title: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
};

/** A big clickable option (email kind, tone, length). */
export default function ChoiceCard({ title, description, selected, onClick }: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-lg border px-4 py-3.5 text-left transition-colors ${
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-sheet hover:border-muted'
      }`}
    >
      <span className="block font-serif text-[17px] font-medium">{title}</span>
      {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
    </button>
  );
}
