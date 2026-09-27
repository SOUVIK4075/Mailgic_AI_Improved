type CharCounterProps = { length: number; max: number };

export default function CharCounter({ length, max }: CharCounterProps) {
  const nearLimit = length > max * 0.9;
  return (
    <span className={`font-mono text-[11px] ${nearLimit ? 'text-danger' : 'text-faint'}`}>
      {length}/{max}
    </span>
  );
}
