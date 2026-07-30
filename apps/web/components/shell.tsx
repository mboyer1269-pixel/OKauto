"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/inventory", label: "Inventory", icon: "🞑" },
  { href: "/listings", label: "Listings", icon: "◫" },
  { href: "/notifications", label: "Notifications", icon: "◔" },
  { href: "/analytics", label: "Analytics", icon: "↗", roles: ["ORG_OWNER", "ORG_MANAGER"] },
  { href: "/team", label: "Team", icon: "☷", roles: ["ORG_OWNER", "ORG_MANAGER"] },
  { href: "/settings", label: "Settings", icon: "⚙" },
] as const;

interface Toast {
  id: number;
  title: string;
  body: string;
}

/** Fetch-stream SSE client (EventSource can't send Authorization headers). */
function useNotificationStream(onEvent: (title: string, body: string) => void, enabled: boolean, accessTokenReady: boolean) {
  const [unread, setUnread] = useState(0);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !accessTokenReady) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const token = sessionStorage.getItem("okauto.token");
        const orgId = localStorage.getItem("okauto.orgId");
        const res = await fetch("/api/v1/notifications/stream", {
          headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(orgId ? { "x-org-id": orgId } : {}),
          },
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const raw of events) {
            const eventLine = raw.split("\n").find((l) => l.startsWith("event: "));
            const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
              if (eventLine?.includes("hello")) {
                setUnread(Number(data.unreadCount ?? 0));
              } else if (eventLine?.includes("notification")) {
                setUnread((n) => n + 1);
                callbackRef.current(String(data.title ?? "Notification"), String(data.body ?? ""));
              }
            } catch {
              // ignore malformed frames
            }
          }
        }
      } catch {
        // Aborted or network drop — the stream is best-effort realtime.
      }
    })();
    return () => controller.abort();
  }, [enabled, accessTokenReady]);

  return { unread, setUnread };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, memberships, activeOrgId, activeRole, loading, logout, setActiveOrg } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const toastId = useRef(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const { unread } = useNotificationStream(
    (title, body) => {
      const id = ++toastId.current;
      setToasts((t) => [...t, { id, title, body }]);
      setTimeout(() => setToasts((t) => t.filter((toast) => toast.id !== id)), 8000);
    },
    Boolean(user),
    Boolean(user),
  );

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const activeMembership = memberships.find((m) => m.orgId === activeOrgId);
  const visibleNav = NAV_ITEMS.filter(
    (item) => !("roles" in item && item.roles) || (item.roles as readonly string[]).includes(activeRole ?? ""),
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile nav toggle */}
      <button
        type="button"
        className="fixed left-3 top-3 z-40 rounded-lg bg-ink-800 p-2 text-ink-200 md:hidden"
        aria-label="Toggle navigation"
        aria-expanded={navOpen}
        onClick={() => setNavOpen((v) => !v)}
      >
        ☰
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-56 transform border-r border-ink-700/60 bg-ink-900 transition-transform md:static md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-ink-700/60 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">OK</div>
          <span className="font-bold text-ink-200">OKauto</span>
        </div>
        <nav className="p-3" aria-label="Primary">
          <ul className="space-y-1">
            {visibleNav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setNavOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      active ? "bg-brand-900/50 text-brand-300" : "text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                    }`}
                  >
                    <span aria-hidden className="w-4 text-center">{item.icon}</span>
                    {item.label}
                    {item.href === "/notifications" && unread > 0 ? (
                      <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white">{unread}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
            {user.isPlatformAdmin ? (
              <li>
                <Link
                  href="/admin"
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                    pathname.startsWith("/admin") ? "bg-brand-900/50 text-brand-300" : "text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                  }`}
                >
                  <span aria-hidden className="w-4 text-center">✦</span>
                  Admin
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-ink-700/60 bg-ink-900/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3 pl-10 md:pl-0">
            {memberships.length > 1 ? (
              <select
                aria-label="Active organization"
                value={activeOrgId ?? ""}
                onChange={(e) => setActiveOrg(e.target.value)}
                className="rounded-lg border border-ink-600 bg-ink-900 px-2 py-1 text-sm"
              >
                {memberships.map((m) => (
                  <option key={m.orgId} value={m.orgId}>
                    {m.org.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-semibold text-ink-200">{activeMembership?.org.name ?? "—"}</span>
            )}
            {activeRole ? <span className="rounded-full bg-ink-700 px-2 py-0.5 text-xs text-ink-400">{activeRole.replace("ORG_", "")}</span> : null}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-400 sm:block">{user.name}</span>
            <button
              type="button"
              onClick={() => void logout().then(() => router.replace("/login"))}
              className="rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-200"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>

      {/* Toasts */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto rounded-xl border border-brand-700/50 bg-ink-800 p-4 shadow-xl">
            <p className="text-sm font-bold text-brand-300">{toast.title}</p>
            <p className="mt-1 line-clamp-3 text-xs text-ink-400">{toast.body}</p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-ink-400 hover:text-ink-200"
              onClick={() => setToasts((t) => t.filter((x) => x.id !== toast.id))}
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
