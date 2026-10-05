"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Car,
  List,
  Users,
  Bell,
  Settings,
  Key,
  FileText,
  LogOut,
  Menu,
  X,
  Activity,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { cn } from "@/lib/utils";
import { getTeamMemberTitle } from "@/lib/team-members";
import { BrandMark } from "@/components/brand-mark";
import { hasMinRole, type RoleType } from "@okauto/shared";

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  minRole?: RoleType;
}> = [
  { href: "/dashboard", label: "Vue du matin", icon: LayoutDashboard },
  { href: "/dashboard/inventory", label: "Inventaire", icon: Car },
  { href: "/dashboard/listings", label: "Publications", icon: List },
  {
    href: "/dashboard/direction",
    label: "Direction",
    icon: BarChart3,
    minRole: "MANAGER",
  },
  { href: "/dashboard/leads", label: "Leads", icon: MessageSquare },
  { href: "/dashboard/sync", label: "Synchronisation", icon: Activity },
  { href: "/dashboard/team", label: "Équipe", icon: Users },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/settings", label: "Paramètres", icon: Settings },
  {
    href: "/dashboard/api-keys",
    label: "Mon extension",
    icon: Key,
  },
  {
    href: "/dashboard/audit",
    label: "Journal",
    icon: FileText,
    minRole: "ADMIN",
  },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, organization, role, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const professionalTitle = getTeamMemberTitle(role, user);
  const currentRole = role as RoleType | null;
  const visibleNavItems = navItems.filter(
    (item) =>
      !item.minRole ||
      (currentRole !== null && hasMinRole(currentRole, item.minRole)),
  );

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      {/* Mobile header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#071426] p-4 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <BrandMark inverted compact />
        <div className="w-8" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 border-r border-white/10 bg-[#071426] text-white shadow-2xl transform transition-transform lg:translate-x-0 lg:static lg:shadow-none",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="border-b border-white/10 p-6">
            <BrandMark inverted />
            <p className="mt-1 truncate text-xs text-slate-400">
              {organization?.name}
            </p>
          </div>
          <nav className="p-4 space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition-colors",
                    active
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-slate-300 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">
                  {user?.name}
                </p>
                <p className="truncate text-xs font-medium text-brand-300">
                  {professionalTitle}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {user?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                title="Déconnexion"
                aria-label="Se déconnecter"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu"
          />
        )}

        {/* Main content */}
        <main className="min-h-screen min-w-0 w-full flex-1">
          <div className="mx-auto min-w-0 max-w-7xl p-4 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
