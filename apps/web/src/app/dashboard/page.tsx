'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import Link from 'next/link';

type Summary = {
  vehiclesByStatus: Record<string, number>;
  eventsByType: Record<string, number>;
  bySalesperson: Array<{
    user: { id: string; firstName: string; lastName: string; email: string };
    counts: Record<string, number>;
  }>;
  syncHealth: Array<{
    id: string;
    name: string;
    type: string;
    lastSyncAt: string | null;
    lastStatus: string | null;
    isActive: boolean;
  }>;
};

export default function DashboardPage() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<Summary>('/v1/analytics/summary', { token })
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [token]);

  const available = summary?.vehiclesByStatus.available ?? 0;
  const listed = summary?.vehiclesByStatus.listed ?? 0;
  const sold = summary?.vehiclesByStatus.sold ?? 0;
  const prepared = summary?.eventsByType.prepared ?? 0;

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Overview</h1>
          <p className="muted">Team listing activity and inventory health (last 30 days).</p>
        </div>
        <Link className="btn" href="/dashboard/inventory">
          Open inventory
        </Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid stats">
        <div className="panel">
          <div className="muted">Available</div>
          <div className="stat-value">{available}</div>
        </div>
        <div className="panel">
          <div className="muted">Listed</div>
          <div className="stat-value">{listed}</div>
        </div>
        <div className="panel">
          <div className="muted">Sold</div>
          <div className="stat-value">{sold}</div>
        </div>
        <div className="panel">
          <div className="muted">Prepared listings</div>
          <div className="stat-value">{prepared}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Salesperson activity</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Listing counts</th>
            </tr>
          </thead>
          <tbody>
            {(summary?.bySalesperson ?? []).map((row) => (
              <tr key={row.user.id}>
                <td>
                  {row.user.firstName} {row.user.lastName}
                </td>
                <td>{row.user.email}</td>
                <td>
                  {Object.entries(row.counts).map(([k, v]) => (
                    <span key={k} className={`badge ${k}`} style={{ marginRight: 6 }}>
                      {k}: {v}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {!summary?.bySalesperson?.length ? (
              <tr>
                <td colSpan={3} className="muted">
                  No listing activity yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Sync health</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Last sync</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(summary?.syncHealth ?? []).map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.type}</td>
                <td>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : '—'}</td>
                <td>
                  <span className={`badge ${s.lastStatus ?? ''}`}>{s.lastStatus ?? 'n/a'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
