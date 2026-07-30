"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { bootstrapSession, logout as apiLogout, type SessionInfo, type SessionOrg, type SessionUser } from "./api";

interface SessionState {
  loading: boolean;
  user: SessionUser | null;
  orgs: SessionOrg[];
  currentOrg: SessionOrg | null;
  setSession: (session: SessionInfo | null) => void;
  selectOrg: (orgId: string) => void;
  refreshOrgs: (orgs: SessionOrg[]) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

const ORG_KEY = "openlot.currentOrgId";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [orgs, setOrgs] = useState<SessionOrg[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrapSession().then((session) => {
      if (cancelled) return;
      if (session) {
        setUser(session.user);
        setOrgs(session.orgs);
        const saved = localStorage.getItem(ORG_KEY);
        setCurrentOrgId(session.orgs.find((o) => o.orgId === saved)?.orgId ?? session.orgs[0]?.orgId ?? null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback((session: SessionInfo | null) => {
    if (!session) {
      setUser(null);
      setOrgs([]);
      setCurrentOrgId(null);
      return;
    }
    setUser(session.user);
    setOrgs(session.orgs);
    setCurrentOrgId((prev) => session.orgs.find((o) => o.orgId === prev)?.orgId ?? session.orgs[0]?.orgId ?? null);
  }, []);

  const selectOrg = useCallback((orgId: string) => {
    setCurrentOrgId(orgId);
    localStorage.setItem(ORG_KEY, orgId);
  }, []);

  const refreshOrgs = useCallback((next: SessionOrg[]) => {
    setOrgs(next);
    setCurrentOrgId((prev) => next.find((o) => o.orgId === prev)?.orgId ?? next[0]?.orgId ?? null);
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setOrgs([]);
    setCurrentOrgId(null);
    localStorage.removeItem(ORG_KEY);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      loading,
      user,
      orgs,
      currentOrg: orgs.find((o) => o.orgId === currentOrgId) ?? null,
      setSession,
      selectOrg,
      refreshOrgs,
      signOut,
    }),
    [loading, user, orgs, currentOrgId, setSession, selectOrg, refreshOrgs, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
