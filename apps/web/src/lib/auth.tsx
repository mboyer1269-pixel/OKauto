'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

type User = { id: string; email: string; firstName: string; lastName: string };
type Membership = {
  id: string;
  role: string;
  organization: { id: string; name: string; slug: string };
  dealership: { id: string; name: string } | null;
};

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  memberships: Membership[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = 'okauto_access';
const REFRESH_KEY = 'okauto_refresh';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async (access?: string) => {
    const t = access ?? token;
    if (!t) {
      setUser(null);
      setMemberships([]);
      return;
    }
    const me = await api<{ user: User; memberships: Membership[] }>('/v1/me', { token: t });
    setUser(me.user);
    setMemberships(me.memberships);
  }, [token]);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    const r = localStorage.getItem(REFRESH_KEY);
    setToken(t);
    setRefreshToken(r);
    if (t) {
      refreshMe(t)
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; refreshToken: string; user: User }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_KEY, res.refreshToken);
    setToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    await refreshMe(res.accessToken);
  }, [refreshMe]);

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      organizationName: string;
    }) => {
      const res = await api<{ accessToken: string; refreshToken: string; user: User }>(
        '/v1/auth/register',
        { method: 'POST', body: JSON.stringify(input) },
      );
      localStorage.setItem(TOKEN_KEY, res.accessToken);
      localStorage.setItem(REFRESH_KEY, res.refreshToken);
      setToken(res.accessToken);
      setRefreshToken(res.refreshToken);
      await refreshMe(res.accessToken);
    },
    [refreshMe],
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await api('/v1/auth/logout', {
          method: 'POST',
          token,
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // ignore
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setMemberships([]);
  }, [token, refreshToken]);

  const value = useMemo(
    () => ({ token, refreshToken, user, memberships, loading, login, register, logout, refreshMe }),
    [token, refreshToken, user, memberships, loading, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
