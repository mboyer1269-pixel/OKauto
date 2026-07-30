"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { clearSession, getStoredSession, type Session } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/inventory", label: "Inventory" },
  { href: "/dashboard/listings", label: "Listings" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/notifications", label: "Alerts" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = getStoredSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setSession(s);
  }, [router]);

  if (!session) {
    return (
      <main className="shell" style={{ padding: "3rem 0" }}>
        <p>Loading workspace…</p>
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          borderBottom: "1px solid var(--line)",
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          className="shell"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "0.85rem 0",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
            <Link href="/dashboard" className="display" style={{ fontSize: "1.6rem" }}>
              OKauto
            </Link>
            <span style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>
              {session.organizationName}
            </span>
          </div>
          <nav style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }} aria-label="Dashboard">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="btn btn-ghost"
                  style={{
                    padding: "0.45rem 0.7rem",
                    background: active ? "var(--mist)" : "transparent",
                    borderColor: active ? "var(--forest)" : "transparent",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.9rem", color: "var(--ink-soft)" }}>
              {session.user.name} · {session.role}
            </span>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                clearSession();
                router.push("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="shell animate-rise" style={{ padding: "1.75rem 0 3rem" }}>
        {children}
      </main>
    </div>
  );
}
