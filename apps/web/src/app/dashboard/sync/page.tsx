'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatDateTime, getStatusBadgeClass } from '@/lib/utils';
import { Activity, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

interface SyncHealth {
  sources: Array<{
    id: string;
    name: string;
    url: string;
    isActive: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  }>;
  recentJobs: Array<{
    id: string;
    status: string;
    source: string;
    successCount: number;
    errorCount: number;
    createdAt: string;
    user: { name: string };
  }>;
  health: {
    status: string;
    sourceCount: number;
    activeSources: number;
    failedJobsLast10: number;
    lastSyncAt: string | null;
  };
}

export default function SyncHealthPage() {
  return (
    <ProtectedRoute>
      <SyncHealthContent />
    </ProtectedRoute>
  );
}

function SyncHealthContent() {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<SyncHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiFetch('/api/v1/admin/sync-health')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [apiFetch]);

  if (loading) return <div className="animate-pulse h-32 bg-slate-200 rounded-xl" />;
  if (!data) return <div className="card">Failed to load sync health.</div>;

  const statusIcon = {
    healthy: <CheckCircle className="text-green-600" size={24} />,
    degraded: <AlertTriangle className="text-amber-600" size={24} />,
    no_sources: <RefreshCw className="text-slate-400" size={24} />,
  }[data.health.status] ?? <Activity size={24} />;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sync Health</h1>

      <div className="card flex items-center gap-4 mb-6">
        {statusIcon}
        <div>
          <p className="font-semibold capitalize">{data.health.status.replace('_', ' ')}</p>
          <p className="text-sm text-slate-500">
            {data.health.activeSources} active source(s) · Last sync: {formatDateTime(data.health.lastSyncAt)}
          </p>
        </div>
        <button onClick={load} className="btn-secondary ml-auto text-sm">
          <RefreshCw size={14} className="mr-1" /> Refresh
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold mb-4">Sync Sources</h2>
          {data.sources.length === 0 ? (
            <p className="text-sm text-slate-500">No sync sources configured.</p>
          ) : (
            <div className="space-y-3">
              {data.sources.map((s) => (
                <div key={s.id} className="border-b pb-3 last:border-0">
                  <div className="flex justify-between">
                    <span className="font-medium">{s.name}</span>
                    <span className={s.isActive ? 'badge-success' : 'badge-neutral'}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{s.url}</p>
                  <p className="text-xs mt-1">
                    {s.lastSyncStatus ? (
                      <span className={s.lastSyncStatus === 'success' ? 'text-green-600' : 'text-red-600'}>
                        {s.lastSyncStatus} · {formatDateTime(s.lastSyncAt)}
                      </span>
                    ) : (
                      'Never synced'
                    )}
                  </p>
                  {s.lastSyncError && (
                    <p className="text-xs text-red-600 mt-1">{s.lastSyncError}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Recent Import Jobs</h2>
          {data.recentJobs.length === 0 ? (
            <p className="text-sm text-slate-500">No import jobs yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recentJobs.map((j) => (
                <div key={j.id} className="flex justify-between text-sm border-b pb-2">
                  <div>
                    <span className="font-medium">{j.source}</span>
                    <span className="text-slate-500 ml-2">by {j.user.name}</span>
                    <p className="text-xs text-slate-500">
                      {j.successCount} ok · {j.errorCount} errors
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={getStatusBadgeClass(j.status)}>{j.status}</span>
                    <p className="text-xs text-slate-500">{formatDateTime(j.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
