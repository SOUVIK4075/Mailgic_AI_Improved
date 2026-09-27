type WizardStepsProps = {
  steps: string[];
  current: number; // 0-based
  onJump: (index: number) => void; // only called for steps already done
  locked?: boolean; // e.g. while a draft is being written
};

/** "1 Kind — 2 Tone — 3 Length …" progress bar. Finished steps are clickable to go back. */
export default function WizardSteps({ steps, current, onJump, locked = false }: WizardStepsProps) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex shrink-0 items-center gap-2">
            {i > 0 && <span className={`h-px w-6 sm:w-10 ${done || active ? 'bg-accent' : 'bg-line'}`} />}
            <button
              type="button"
              disabled={!done || locked}
              onClick={() => onJump(i)}
              aria-current={active ? 'step' : undefined}
              className="flex items-center gap-2 text-sm disabled:cursor-default"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[11px] ${
                  done ? 'border-accent bg-accent text-white' : active ? 'border-ink text-ink' : 'border-line text-faint'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={active ? 'font-medium text-ink' : done ? 'text-muted hover:text-ink' : 'text-faint'}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
