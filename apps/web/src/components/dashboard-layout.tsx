'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from './auth-provider';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Car },
  { href: '/dashboard/listings', label: 'Listings', icon: List },
  { href: '/dashboard/sync', label: 'Sync Health', icon: Activity },
  { href: '/dashboard/team', label: 'Team', icon: Users },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: Key },
  { href: '/dashboard/audit', label: 'Audit Log', icon: FileText },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, organization, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span className="font-semibold text-brand-700">OKauto</span>
        <div className="w-8" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r transform transition-transform lg:translate-x-0 lg:static',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="p-6 border-b">
            <h1 className="text-xl font-bold text-brand-700">OKauto</h1>
            <p className="text-xs text-slate-500 mt-1 truncate">{organization?.name}</p>
          </div>
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500" title="Logout">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <main className="flex-1 min-h-screen">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
