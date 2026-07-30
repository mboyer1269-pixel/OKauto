'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatNumber } from '@/lib/utils';
import { Car, List, AlertTriangle, TrendingUp, Users } from 'lucide-react';

interface DashboardStats {
  totalVehicles: number;
  availableVehicles: number;
  soldVehicles: number;
  activeListings: number;
  staleListings: number;
  listingsThisWeek: number;
  memberStats: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
    totalListings: number;
    weekListings: number;
    monthListings: number;
    lastActivity: string | null;
  }>;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { apiFetch } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/v1/analytics/dashboard')
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [apiFetch]);

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-32 bg-slate-200 rounded-xl" /></div>;
  }

  const cards = [
    { label: 'Total Inventory', value: stats?.totalVehicles ?? 0, icon: Car, color: 'text-blue-600' },
    { label: 'Available', value: stats?.availableVehicles ?? 0, icon: Car, color: 'text-green-600' },
    { label: 'Active Listings', value: stats?.activeListings ?? 0, icon: List, color: 'text-brand-600' },
    { label: 'Listings This Week', value: stats?.listingsThisWeek ?? 0, icon: TrendingUp, color: 'text-purple-600' },
    { label: 'Stale Listings', value: stats?.staleListings ?? 0, icon: AlertTriangle, color: 'text-amber-600' },
    { label: 'Sold', value: stats?.soldVehicles ?? 0, icon: Car, color: 'text-red-600' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard Overview</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="card flex items-center gap-4">
            <c.icon className={c.color} size={28} />
            <div>
              <p className="text-sm text-slate-500">{c.label}</p>
              <p className="text-2xl font-bold">{formatNumber(c.value)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Users size={20} />
          <h2 className="text-lg font-semibold">Team Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="pb-3 pr-4">Name</th>
                <th className="pb-3 pr-4">Role</th>
                <th className="pb-3 pr-4">This Week</th>
                <th className="pb-3 pr-4">This Month</th>
                <th className="pb-3 pr-4">Total</th>
                <th className="pb-3">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {stats?.memberStats.map((m) => (
                <tr key={m.userId} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{m.name}</td>
                  <td className="py-3 pr-4"><span className="badge-neutral">{m.role}</span></td>
                  <td className="py-3 pr-4">{m.weekListings}</td>
                  <td className="py-3 pr-4">{m.monthListings}</td>
                  <td className="py-3 pr-4">{m.totalListings}</td>
                  <td className="py-3 text-slate-500">
                    {m.lastActivity ? new Date(m.lastActivity).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
