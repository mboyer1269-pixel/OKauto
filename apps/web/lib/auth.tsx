"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, type FetchOptions } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  onboarding: Record<string, boolean>;
  settings: Record<string, unknown>;
  timezone?: string;
}

export interface Membership {
  orgId: string;
  role: "ORG_OWNER" | "ORG_MANAGER" | "SALESPERSON";
  org: OrgInfo;
}

interface LoginResult {
  accessToken: string;
  user: AuthUser;
  memberships?: Membership[];
  org?: { id: string; name: string; slug: string; role: Membership["role"] };
}

export interface AuthContextValue {
  user: AuthUser | null;
  memberships: Membership[];
  activeOrgId: string | null;
  activeRole: Membership["role"] | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  setActiveOrg: (orgId: string) => void;
  reloadMemberships: () => Promise<void>;
  api: <T>(path: string, options?: FetchOptions) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "okauto.token";
const ORG_KEY = "okauto.orgId";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const applySession = useCallback((accessToken: string | null) => {
    tokenRef.current = accessToken;
    if (accessToken) sessionStorage.setItem(TOKEN_KEY, accessToken);
    else sessionStorage.removeItem(TOKEN_KEY);
  }, []);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
      if (!res.ok) {
        applySession(null);
        setUser(null);
        return null;
      }
      const json = (await res.json()) as { accessToken: string; user: AuthUser };
      applySession(json.accessToken);
      setUser(json.user);
      return json.accessToken;
    } catch {
      return null;
    }
  }, [applySession]);

  const loadMe = useCallback(
    async (token: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/v1/auth/me", {
          headers: { authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) return false;
        const json = (await res.json()) as { user: AuthUser; memberships: Membership[] };
        setUser(json.user);
        setMemberships(json.memberships);
        const storedOrg = localStorage.getItem(ORG_KEY);
        const valid = json.memberships.find((m) => m.orgId === storedOrg);
        const chosen = valid ? storedOrg! : (json.memberships[0]?.orgId ?? null);
        setActiveOrgId(chosen);
        if (chosen) localStorage.setItem(ORG_KEY, chosen);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      const stored = sessionStorage.getItem(TOKEN_KEY);
      if (stored) {
        tokenRef.current = stored;
        if (await loadMe(stored)) {
          setLoading(false);
          return;
        }
      }
      const fresh = await refresh();
      if (fresh) await loadMe(fresh);
      setLoading(false);
    })();
  }, [loadMe, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as LoginResult & { error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "Login failed");
      applySession(json.accessToken);
      setUser(json.user);
      const memberships = json.memberships ?? (json.org ? [{ orgId: json.org.id, role: json.org.role, org: { id: json.org.id, name: json.org.name, slug: json.org.slug } as OrgInfo }] : []);
      setMemberships(memberships);
      const orgId = memberships[0]?.orgId ?? null;
      setActiveOrgId(orgId);
      if (orgId) localStorage.setItem(ORG_KEY, orgId);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    applySession(null);
    setUser(null);
    setMemberships([]);
    setActiveOrgId(null);
    localStorage.removeItem(ORG_KEY);
  }, [applySession]);

  const setActiveOrg = useCallback((orgId: string) => {
    setActiveOrgId(orgId);
    localStorage.setItem(ORG_KEY, orgId);
  }, []);

  const reloadMemberships = useCallback(async () => {
    if (tokenRef.current) await loadMe(tokenRef.current);
  }, [loadMe]);

  const api = useCallback(
    async <T,>(path: string, options: FetchOptions = {}): Promise<T> =>
      apiFetch<T>({ accessToken: tokenRef.current, orgId: activeOrgId }, path, {
        ...options,
        onUnauthorized: async () => {
          const fresh = await refresh();
          if (fresh) tokenRef.current = fresh;
          return fresh;
        },
      }),
    [activeOrgId, refresh],
  );

  const activeRole = useMemo(
    () => memberships.find((m) => m.orgId === activeOrgId)?.role ?? null,
    [memberships, activeOrgId],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      memberships,
      activeOrgId,
      activeRole,
      loading,
      login,
      logout,
      refresh,
      setActiveOrg,
      reloadMemberships,
      api,
    }),
    [user, memberships, activeOrgId, activeRole, loading, login, logout, refresh, setActiveOrg, reloadMemberships, api],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
