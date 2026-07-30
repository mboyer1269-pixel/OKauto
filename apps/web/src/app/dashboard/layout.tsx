'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

const links = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/inventory', label: 'Inventory' },
  { href: '/dashboard/listings', label: 'Listings' },
  { href: '/dashboard/alerts', label: 'Alerts' },
  { href: '/dashboard/team', label: 'Team' },
  { href: '/dashboard/sources', label: 'Sources' },
  { href: '/dashboard/audit', label: 'Audit' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, memberships, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="auth-page">
        <p className="muted">Loading workspace…</p>
      </div>
    );
  }

  const org = memberships[0]?.organization;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            OK<span>auto</span>
          </div>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
            {org?.name ?? 'Dealership'}
          </p>
        </div>
        <nav className="nav" aria-label="Primary">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? 'active' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: 'auto' }}>
          <p style={{ margin: '0 0 0.35rem' }}>
            {user.firstName} {user.lastName}
          </p>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
            {memberships[0]?.role}
          </p>
          <button className="btn secondary" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
