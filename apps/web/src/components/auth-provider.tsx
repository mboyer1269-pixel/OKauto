"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

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
  isPlatformAdmin: boolean;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthState | null>(null);

function normalizeLegacyDemoUser(user: User) {
  const isDemoOwner =
    user.email.toLocaleLowerCase("fr-CA") === "owner@demo.okauto.local";
  const hasLegacyName = user.name
    .trim()
    .toLocaleLowerCase("fr-CA")
    .startsWith("alex");
  return isDemoOwner && hasLegacyName
    ? { ...user, name: "Michael Boyer" }
    : user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
      if (!headers.has("Content-Type") && options.body) {
        headers.set("Content-Type", "application/json");
      }

      let response = await fetch(url, { ...options, headers });

      if (response.status === 401 && refreshToken) {
        const refreshRes = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setAccessToken(data.accessToken);
          localStorage.setItem("accessToken", data.accessToken);
          headers.set("Authorization", `Bearer ${data.accessToken}`);
          response = await fetch(url, { ...options, headers });
        }
      }

      return response;
    },
    [accessToken, refreshToken],
  );

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      const stored = {
        accessToken: localStorage.getItem("accessToken"),
        refreshToken: localStorage.getItem("refreshToken"),
        user: localStorage.getItem("user"),
        organization: localStorage.getItem("organization"),
        role: localStorage.getItem("role"),
      };

      if ((!stored.accessToken && !stored.refreshToken) || !stored.user) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const cachedUser = normalizeLegacyDemoUser(
          JSON.parse(stored.user) as User,
        );
        const cachedOrganization = stored.organization
          ? (JSON.parse(stored.organization) as Organization)
          : null;

        if (!cancelled) {
          setUser(cachedUser);
          setOrganization(cachedOrganization);
          setRole(stored.role);
          setAccessToken(stored.accessToken);
          setRefreshToken(stored.refreshToken);
        }
        localStorage.setItem("user", JSON.stringify(cachedUser));

        let currentAccessToken = stored.accessToken;
        let profileResponse = currentAccessToken
          ? await fetch("/api/v1/auth/me", {
              headers: { Authorization: `Bearer ${currentAccessToken}` },
            })
          : null;

        if (
          (!profileResponse || profileResponse.status === 401) &&
          stored.refreshToken
        ) {
          const refreshResponse = await fetch("/api/v1/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: stored.refreshToken }),
          });

          if (refreshResponse.ok) {
            const refreshed = (await refreshResponse.json()) as {
              accessToken: string;
            };
            currentAccessToken = refreshed.accessToken;
            localStorage.setItem("accessToken", currentAccessToken);
            if (!cancelled) setAccessToken(currentAccessToken);
            profileResponse = await fetch("/api/v1/auth/me", {
              headers: { Authorization: `Bearer ${currentAccessToken}` },
            });
          }
        }

        if (profileResponse?.ok) {
          const profile = (await profileResponse.json()) as {
            user: User;
            organization: Organization;
            role: string;
            isPlatformAdmin?: boolean;
          };
          if (!cancelled) {
            setUser(profile.user);
            setOrganization(profile.organization);
            setRole(profile.role);
            setIsPlatformAdmin(Boolean(profile.isPlatformAdmin));
          }
          localStorage.setItem("user", JSON.stringify(profile.user));
          localStorage.setItem(
            "organization",
            JSON.stringify(profile.organization),
          );
          localStorage.setItem("role", profile.role);
        } else if (profileResponse?.status === 401) {
          [
            "accessToken",
            "refreshToken",
            "user",
            "organization",
            "role",
          ].forEach((key) => localStorage.removeItem(key));
          if (!cancelled) {
            setUser(null);
            setOrganization(null);
            setRole(null);
            setIsPlatformAdmin(false);
            setAccessToken(null);
            setRefreshToken(null);
          }
        }
      } catch {
        // Keep the locally cached profile when the development server is temporarily unavailable.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void initializeSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = (data: {
    accessToken: string;
    refreshToken: string;
    user: User;
    organization: Organization;
    role?: string;
    isPlatformAdmin?: boolean;
  }) => {
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    setOrganization(data.organization);
    setRole(data.role ?? null);
    setIsPlatformAdmin(Boolean(data.isPlatformAdmin));
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("organization", JSON.stringify(data.organization));
    if (data.role) localStorage.setItem("role", data.role);
  };

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "La connexion a échoué.");
    }
    const data = await res.json();
    persist(data);
  };

  const register = async (data: {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
  }) => {
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "La création du compte a échoué.");
    }
    const result = await res.json();
    persist({ ...result, role: "OWNER" });
  };

  const logout = async () => {
    if (refreshToken) {
      try {
        await fetch("/api/v1/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Local logout must still complete if the server is unreachable.
      }
    }
    setUser(null);
    setOrganization(null);
    setRole(null);
    setIsPlatformAdmin(false);
    setAccessToken(null);
    setRefreshToken(null);
    ["accessToken", "refreshToken", "user", "organization", "role"].forEach(
      (key) => localStorage.removeItem(key),
    );
    window.location.assign("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        role,
        isPlatformAdmin,
        accessToken,
        isLoading,
        login,
        register,
        logout,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
