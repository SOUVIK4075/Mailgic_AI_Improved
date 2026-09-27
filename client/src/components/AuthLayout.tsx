import type { ReactNode } from 'react';

type AuthLayoutProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
};

/** Narrow centred card shared by login, signup, forgot and reset password. */
export default function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-sm px-5 py-16">
      <h1 className="font-serif text-3xl font-medium tracking-tight">{title}</h1>
      {subtitle && <div className="mt-2 text-sm text-muted">{subtitle}</div>}
      <div className="mt-8 space-y-5 rounded-lg border border-line bg-sheet p-6">{children}</div>
    </div>
  );
}
