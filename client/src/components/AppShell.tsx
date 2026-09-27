import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { BarChart3, Bell, BookText, CornerUpLeft, Inbox, LogOut, PenLine } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { UsageResponse } from '../types';
import Logo from './Logo';

const NAV = [
  { to: '/app', label: 'New email', icon: PenLine },
  { to: '/app/reply', label: 'Reply', icon: CornerUpLeft },
  { to: '/app/history', label: 'History', icon: Inbox },
  { to: '/app/reminders', label: 'Reminders', icon: Bell },
  { to: '/app/insights', label: 'Insights', icon: BarChart3 },
  { to: '/app/knowledge', label: 'Knowledge', icon: BookText },
];

type Usage = { remaining: number; limit: number } | null;
type AppContext = { setRemaining: (remaining: number) => void };

/** Pages inside the app call this to update the "drafts left today" meter after generating. */
export function useUsage() {
  return useOutletContext<AppContext>();
}

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors whitespace-nowrap ${
    isActive ? 'bg-sheet text-ink font-medium shadow-[0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink'
  }`;
}

function UsageMeter({ usage }: { usage: Usage }) {
  if (!usage) return null;
  const used = usage.limit - usage.remaining;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted">
        {usage.remaining} of {usage.limit} drafts left today
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, (used / usage.limit) * 100)}%` }} />
      </div>
    </div>
  );
}

/** Logged-in layout: sidebar on desktop, a top bar with scrollable links on mobile. */
export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<Usage>(null);

  useEffect(() => {
    api<UsageResponse>('/usage')
      .then((d) => setUsage({ limit: d.dailyLimit, remaining: Math.max(0, d.dailyLimit - d.today.requests) }))
      .catch(() => setUsage(null)); // not critical, the meter just stays hidden
  }, []);

  function setRemaining(remaining: number) {
    setUsage((u) => (u ? { ...u, remaining } : u));
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const links = NAV.map(({ to, label, icon: Icon }) => (
    // `end` so "/app" isn't also highlighted on "/app/history"
    <NavLink key={to} to={to} end className={navClass}>
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {label}
    </NavLink>
  ));

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line px-4 py-6 lg:flex lg:sticky lg:top-0 lg:h-screen">
        <div className="px-3">
          <Logo to="/app" />
        </div>
        <nav className="mt-8 space-y-0.5">{links}</nav>

        <div className="mt-auto space-y-5 px-3">
          <UsageMeter usage={usage} />
          <div className="border-t border-line pt-4">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
            <button type="button" onClick={handleLogout} className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
              <LogOut className="h-3.5 w-3.5" /> Log out
            </button>
          </div>
        </div>
      </aside>

      <header className="border-b border-line px-4 pt-4 lg:hidden">
        <div className="flex items-center justify-between">
          <Logo to="/app" />
          <button type="button" onClick={handleLogout} className="text-sm text-muted hover:text-ink">
            Log out
          </button>
        </div>
        <nav className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-3">{links}</nav>
      </header>

      <main className="min-w-0 flex-1 px-5 py-8 lg:px-12 lg:py-10">
        <Outlet context={{ setRemaining } satisfies AppContext} />
      </main>
    </div>
  );
}
