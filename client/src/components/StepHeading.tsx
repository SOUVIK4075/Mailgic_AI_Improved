import type { ReactNode } from 'react';

/** Question-style heading at the top of each wizard step. */
export default function StepHeading({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-serif text-2xl font-medium tracking-tight">{title}</h2>
      {hint && <p className="mt-1 text-muted">{hint}</p>}
    </div>
  );
}
