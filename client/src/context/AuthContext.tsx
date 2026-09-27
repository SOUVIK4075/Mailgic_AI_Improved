import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, refreshSession, setSessionExpiredHandler } from '../lib/api';
import type { User, UserResponse } from '../types';

type AuthContextValue = {
  user: User | null;
  loading: boolean; // true until the first /auth/me call finishes
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchCurrentUser(): Promise<User | null> {
  try {
    const data = await api<UserResponse>('/auth/me');
    return data.user;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    // No access cookie at all (e.g. it was cleared) — the server says UNAUTHENTICATED instead of
    // TOKEN_EXPIRED. A refresh cookie may still exist, so try refreshing once before giving up.
    if (err.code === 'TOKEN_EXPIRED' || !(await refreshSession())) return null;
    const data = await api<UserResponse>('/auth/me');
    return data.user;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If a refresh fails later (e.g. refresh token expired), api.ts calls this.
    setSessionExpiredHandler(() => setUser(null));

    fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    return () => setSessionExpiredHandler(null);
  }, []);

  async function login(email: string, password: string) {
    const data = await api<UserResponse>('/auth/login', { method: 'POST', body: { email, password } });
    setUser(data.user);
  }

  async function signup(name: string, email: string, password: string) {
    const data = await api<UserResponse>('/auth/signup', { method: 'POST', body: { name, email, password } });
    setUser(data.user);
  }

  async function logout() {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null); // log out locally even if the request failed
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
