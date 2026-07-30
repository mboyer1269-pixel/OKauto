'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/client';

const LINKS = [
  ['/dashboard', 'Overview'],
  ['/dashboard/inventory', 'Inventory'],
  ['/dashboard/listings', 'Listings'],
  ['/dashboard/analytics', 'Analytics'],
  ['/dashboard/team', 'Team'],
  ['/dashboard/activity', 'Activity'],
  ['/dashboard/settings', 'Settings'],
] as const;

export function Topbar({ orgName, userName }: { orgName: string; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <div className="row">
          <Link href="/dashboard" className="brand">
            OK<span>auto</span>
          </Link>
          <span className="pill" title="Active dealership">
            {orgName}
          </span>
        </div>
        <nav className="nav" aria-label="Primary">
          {LINKS.map(([href, label]) => {
            const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={active ? 'active' : ''}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="row">
          <span className="small muted" aria-hidden>
            {userName}
          </span>
          <button className="btn btn-sm" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
