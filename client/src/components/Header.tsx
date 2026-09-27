import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

/** Top bar for the public pages (landing, login, signup). The app itself uses the sidebar in AppShell. */
export default function Header() {
  const { user, loading } = useAuth();

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        {!loading && (
          <nav className="flex items-center gap-5 text-sm">
            {user ? (
              <Link to="/app" className="btn">
                Open Mailgic
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-muted hover:text-ink">
                  Log in
                </Link>
                <Link to="/signup" className="btn">
                  Get started
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
