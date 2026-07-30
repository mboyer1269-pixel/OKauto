'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface AuthState {
  user: User | null;
  organization: Organization | null;
  role: string | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; organizationName?: string }) => Promise<void>;
  logout: () => void;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
      if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }

      let response = await fetch(url, { ...options, headers });

      if (response.status === 401 && refreshToken) {
        const refreshRes = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setAccessToken(data.accessToken);
          localStorage.setItem('accessToken', data.accessToken);
          headers.set('Authorization', `Bearer ${data.accessToken}`);
          response = await fetch(url, { ...options, headers });
        }
      }

      return response;
    },
    [accessToken, refreshToken]
  );

  useEffect(() => {
    const stored = {
      accessToken: localStorage.getItem('accessToken'),
      refreshToken: localStorage.getItem('refreshToken'),
      user: localStorage.getItem('user'),
      organization: localStorage.getItem('organization'),
      role: localStorage.getItem('role'),
    };

    if (stored.accessToken && stored.user) {
      setAccessToken(stored.accessToken);
      setRefreshToken(stored.refreshToken);
      setUser(JSON.parse(stored.user));
      if (stored.organization) setOrganization(JSON.parse(stored.organization));
      if (stored.role) setRole(stored.role);
    }
    setIsLoading(false);
  }, []);

  const persist = (data: {
    accessToken: string;
    refreshToken: string;
    user: User;
    organization: Organization;
    role?: string;
  }) => {
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    setOrganization(data.organization);
    setRole(data.role ?? null);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('organization', JSON.stringify(data.organization));
    if (data.role) localStorage.setItem('role', data.role);
  };

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Login failed');
    }
    const data = await res.json();
    persist(data);
  };

  const register = async (data: { email: string; password: string; name: string; organizationName?: string }) => {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Registration failed');
    }
    const result = await res.json();
    persist({ ...result, role: 'OWNER' });
  };

  const logout = () => {
    setUser(null);
    setOrganization(null);
    setRole(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.clear();
  };

  return (
    <AuthContext.Provider value={{ user, organization, role, accessToken, isLoading, login, register, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
