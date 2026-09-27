type SpinnerProps = { className?: string };

export default function Spinner({ className = 'h-5 w-5 border-muted' }: SpinnerProps) {
  return <span role="status" aria-label="Loading" className={`inline-block animate-spin rounded-full border-2 border-t-transparent ${className}`} />;
}
