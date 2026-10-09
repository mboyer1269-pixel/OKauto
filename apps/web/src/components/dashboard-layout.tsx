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
  Inbox,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { cn } from "@/lib/utils";
import { getTeamMemberTitle } from "@/lib/team-members";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { hasMinRole, type RoleType } from "@okauto/shared";

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  minRole?: RoleType;
  platformAdmin?: boolean;
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
  {
    href: "/dashboard/access-requests",
    label: "Demandes d’accès",
    icon: Inbox,
    platformAdmin: true,
  },
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
  const { user, organization, role, logout, isPlatformAdmin } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const professionalTitle = getTeamMemberTitle(role, user);
  const currentRole = role as RoleType | null;
  const visibleNavItems = navItems.filter((item) => {
    if (item.platformAdmin) return isPlatformAdmin;
    return (
      !item.minRole ||
      (currentRole !== null && hasMinRole(currentRole, item.minRole))
    );
  });

  return (
    <div className="cockpit-grid min-h-screen bg-background">
      <a
        href="#contenu-principal"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-3 py-3 text-sidebar-foreground lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent"
          aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <BrandMark lockup inverted size="app" className="max-w-[10rem]" />
        <div className="w-8" />
      </div>

      <div className="flex">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col overflow-hidden border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground shadow-2xl backdrop-blur-xl transition-transform lg:static lg:translate-x-0 lg:shadow-none",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="cockpit-scan shrink-0 border-b border-sidebar-border px-3 py-4">
            <BrandMark lockup inverted size="app" className="w-full max-w-full" />
            <p className="mt-2 truncate font-mono text-[11px] uppercase tracking-[0.16em] text-sidebar-accent">
              {organization?.name}
            </p>
          </div>
          <nav
            className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 pb-40"
            aria-label="Navigation principale"
          >
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
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors",
                    active
                      ? "bg-sidebar-accent/15 text-sidebar-accent shadow-[0_0_18px_hsl(var(--sidebar-accent)/0.28)]"
                      : "text-sidebar-foreground/75 hover:bg-white/10 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 border-t border-sidebar-border p-3">
            <div className="mb-2">
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sidebar-foreground">
                  {user?.name}
                </p>
                <p className="truncate text-xs font-medium text-sidebar-accent">
                  {professionalTitle}
                </p>
                <p className="truncate font-mono text-[11px] text-sidebar-foreground/50">
                  {user?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-white/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent"
                title="Déconnexion"
                aria-label="Se déconnecter"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu"
          />
        )}

        <main
          id="contenu-principal"
          className="min-h-screen min-w-0 w-full flex-1"
        >
          <div className="mx-auto min-w-0 max-w-[90rem] p-4 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
