import { Link } from 'react-router-dom';

/** Envelope mark + serif wordmark. */
export default function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 text-ink">
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="currentColor" className="text-accent" />
        <path d="M7.5 10.5h17v11h-17z" fill="none" stroke="#f5f2ea" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M7.5 10.5l8.5 6.5 8.5-6.5" fill="none" stroke="#f5f2ea" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <span className="font-serif text-xl font-medium tracking-tight">Mailgic</span>
    </Link>
  );
}
