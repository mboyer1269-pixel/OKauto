'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatDateTime, getStatusBadgeClass } from '@/lib/utils';
import { Activity, AlertTriangle, CheckCircle, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';

interface SyncSource {
  id: string;
  name: string;
  url: string;
  adapter: string;
  isActive: boolean;
  intervalMinutes: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

interface SyncHealth {
  sources: SyncSource[];
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
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', url: '', adapter: 'generic', intervalMinutes: 60 });

  const load = () => {
    setLoading(true);
    apiFetch('/api/v1/admin/sync-health')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [apiFetch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/v1/admin/sync-sources', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ name: '', url: '', adapter: 'generic', intervalMinutes: 60 });
      load();
    } else {
      const err = await res.json();
      alert(err.error ?? 'Failed to create sync source');
    }
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    const res = await apiFetch(`/api/v1/admin/sync-sources/${id}/sync`, { method: 'POST' });
    setSyncing(null);
    if (res.ok) {
      setTimeout(load, 2000);
    } else {
      const err = await res.json();
      alert(err.error ?? 'Failed to queue sync');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this sync source?')) return;
    await apiFetch(`/api/v1/admin/sync-sources/${id}`, { method: 'DELETE' });
    load();
  };

  const handleToggle = async (source: SyncSource) => {
    await apiFetch(`/api/v1/admin/sync-sources/${source.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !source.isActive }),
    });
    load();
  };

  if (loading) return <div className="animate-pulse h-32 bg-slate-200 rounded-xl" />;
  if (!data) return <div className="card">Failed to load sync health.</div>;

  const statusIcon = {
    healthy: <CheckCircle className="text-green-600" size={24} />,
    degraded: <AlertTriangle className="text-amber-600" size={24} />,
    no_sources: <RefreshCw className="text-slate-400" size={24} />,
  }[data.health.status] ?? <Activity size={24} />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Sync Health</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          <Plus size={14} className="mr-1" /> Add Source
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-4">
          <h2 className="font-semibold">New Sync Source</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <input className="input" placeholder="Name (e.g. Dealer Website)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <select className="input" value={form.adapter}
              onChange={(e) => setForm({ ...form, adapter: e.target.value })}>
              <option value="generic">Generic JSON</option>
              <option value="dealer-json">Dealer JSON Feed</option>
              <option value="json-ld">JSON-LD (HTML page)</option>
            </select>
            <input className="input md:col-span-2" placeholder="Feed URL" type="url" value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })} required />
            <input className="input" type="number" min={5} placeholder="Interval (minutes)" value={form.intervalMinutes}
              onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      )}

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
            <p className="text-sm text-slate-500">No sync sources configured. Add one to sync inventory from a URL.</p>
          ) : (
            <div className="space-y-3">
              {data.sources.map((s) => (
                <div key={s.id} className="border-b pb-3 last:border-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-slate-400 ml-2">({s.adapter})</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleSync(s.id)} disabled={syncing === s.id}
                        className="btn-secondary text-xs px-2 py-1" title="Sync now">
                        <Zap size={12} className={syncing === s.id ? 'animate-pulse' : ''} />
                      </button>
                      <button onClick={() => handleToggle(s)} className="btn-secondary text-xs px-2 py-1">
                        {s.isActive ? 'Pause' : 'Resume'}
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="btn-danger text-xs px-2 py-1">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{s.url}</p>
                  <p className="text-xs mt-1">
                    Every {s.intervalMinutes}m ·{' '}
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
