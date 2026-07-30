"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/client-api";

interface NavItem {
  href: string;
  label: string;
  minRole?: "MANAGER";
  icon: string;
}

const NAV: NavItem[] = [
  { href: "", label: "Overview", icon: "◧" },
  { href: "/inventory", label: "Inventory", icon: "🚗" },
  { href: "/listings", label: "Listings", icon: "🏷" },
  { href: "/analytics", label: "Team analytics", icon: "📈", minRole: "MANAGER" },
  { href: "/sources", label: "Sync health", icon: "🔄", minRole: "MANAGER" },
  { href: "/team", label: "Team", icon: "👥", minRole: "MANAGER" },
  { href: "/audit", label: "Audit log", icon: "📜", minRole: "MANAGER" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function DashboardShell({
  orgId,
  orgName,
  role,
  user,
  organizations,
  unreadCount,
  children,
}: {
  orgId: string;
  orgName: string;
  role: string;
  user: { name: string; email: string; isPlatformAdmin: boolean };
  organizations: Array<{ id: string; name: string }>;
  unreadCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isManager = role === "OWNER" || role === "MANAGER";

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const nav = NAV.filter((item) => !item.minRole || isManager);

  const sidebar = (
    <nav aria-label="Main navigation" className="flex h-full flex-col">
      <div className="px-4 py-5">
        <Link href={`/o/${orgId}`} className="text-xl font-black tracking-tight text-white">
          Lot<span className="text-brand-400">Pilot</span>
        </Link>
        {organizations.length > 1 ? (
          <select
            aria-label="Switch dealership"
            className="mt-3 w-full rounded-lg border border-brand-800 bg-brand-950 px-2 py-1.5 text-sm text-white"
            value={orgId}
            onChange={(e) => router.push(`/o/${e.target.value}`)}
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1 truncate text-sm text-brand-300">{orgName}</p>
        )}
      </div>
      <ul className="flex-1 space-y-0.5 px-2">
        {nav.map((item) => {
          const href = `/o/${orgId}${item.href}`;
          const active = item.href === "" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={item.href}>
              <Link
                href={href}
                onClick={() => setSidebarOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-800 text-white"
                    : "text-brand-200 hover:bg-brand-900 hover:text-white"
                }`}
              >
                <span aria-hidden className="w-5 text-center">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
        {user.isPlatformAdmin ? (
          <li>
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-amber-300 hover:bg-brand-900"
            >
              <span aria-hidden className="w-5 text-center">
                🛡
              </span>
              Platform admin
            </Link>
          </li>
        ) : null}
      </ul>
      <div className="border-t border-brand-900 px-4 py-4">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-brand-300">
          {user.email} · {role.toLowerCase()}
        </p>
        <button
          onClick={logout}
          className="mt-2 text-xs font-semibold text-brand-300 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between bg-brand-950 px-4 py-3 lg:hidden">
        <button
          aria-label="Open navigation menu"
          className="rounded-lg p-1.5 text-white hover:bg-brand-900"
          onClick={() => setSidebarOpen(true)}
        >
          <span aria-hidden>☰</span>
        </button>
        <span className="font-black text-white">
          Lot<span className="text-brand-400">Pilot</span>
        </span>
        <NotificationsBell unreadCount={unreadCount} />
      </header>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-brand-950">{sidebar}</div>
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 bg-brand-950 lg:block">{sidebar}</aside>

      <div className="flex-1">
        <div className="hidden items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3 lg:flex">
          <NotificationsBell unreadCount={unreadCount} />
        </div>
        <main className="mx-auto max-w-7xl p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function NotificationsBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notifications"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      className="relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:text-slate-600"
    >
      <span aria-hidden className="text-lg">
        🔔
      </span>
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
