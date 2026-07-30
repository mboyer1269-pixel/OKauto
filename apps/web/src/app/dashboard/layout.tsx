"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { Spinner } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Overview", roles: ["OWNER", "MANAGER", "SALESPERSON"] },
  { href: "/dashboard/inventory", label: "Inventory", roles: ["OWNER", "MANAGER", "SALESPERSON"] },
  { href: "/dashboard/listings", label: "Listings", roles: ["OWNER", "MANAGER", "SALESPERSON"] },
  { href: "/dashboard/notifications", label: "Notifications", roles: ["OWNER", "MANAGER", "SALESPERSON"] },
  { href: "/dashboard/team", label: "Team", roles: ["OWNER", "MANAGER"] },
  { href: "/dashboard/sync", label: "Sync health", roles: ["OWNER", "MANAGER"] },
  { href: "/dashboard/audit", label: "Audit log", roles: ["OWNER", "MANAGER"] },
  { href: "/dashboard/settings", label: "Settings", roles: ["OWNER", "MANAGER"] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, orgs, currentOrg, selectOrg, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: unread } = useApi<{ count: number }>(user ? "/api/v1/notifications/unread-count" : null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && orgs.length === 0) router.replace("/onboarding");
  }, [loading, user, orgs, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading your workspace…" />
      </main>
    );
  }
  if (!currentOrg) return null;

  const role = currentOrg.role;
  const nav = NAV.filter((item) => item.roles.includes(role));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 transform border-r border-slate-800 bg-slate-900 text-slate-200 transition-transform lg:static lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-slate-800 px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">
            O
          </span>
          <span className="text-sm font-bold tracking-tight">OpenLot</span>
        </div>
        <div className="border-b border-slate-800 p-3">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Dealership
          </label>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
            value={currentOrg.orgId}
            onChange={(e) => selectOrg(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.orgId} value={o.orgId}>
                {o.name} ({o.role.toLowerCase()})
              </option>
            ))}
          </select>
        </div>
        <nav className="space-y-0.5 p-3" aria-label="Main navigation">
          {nav.map((item) => {
            const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
            const isNotifications = item.href === "/dashboard/notifications";
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                {item.label}
                {isNotifications && (unread?.count ?? 0) > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unread!.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-800 p-3">
          <div className="mb-2 truncate px-1 text-xs text-slate-400" title={user.email}>
            {user.name}
          </div>
          <button
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
            className="w-full rounded-lg border border-slate-700 px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            aria-label="Toggle navigation"
          >
            ☰ Menu
          </button>
          <span className="text-sm font-bold">OpenLot</span>
        </header>
        {menuOpen && (
          <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)} />
        )}
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
