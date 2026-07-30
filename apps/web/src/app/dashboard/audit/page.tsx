'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatDateTime } from '@/lib/utils';

interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

export default function AuditPage() {
  return (
    <ProtectedRoute>
      <AuditContent />
    </ProtectedRoute>
  );
}

function AuditContent() {
  const { apiFetch } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    apiFetch('/api/v1/admin/audit-logs').then((r) => r.json()).then((d) => setLogs(d.logs ?? []));
  }, [apiFetch]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="pb-3 pr-4">Time</th>
              <th className="pb-3 pr-4">User</th>
              <th className="pb-3 pr-4">Action</th>
              <th className="pb-3 pr-4">Entity</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-3 pr-4 text-slate-500">{formatDateTime(l.createdAt)}</td>
                <td className="py-3 pr-4">{l.user?.name ?? 'System'}</td>
                <td className="py-3 pr-4"><span className="badge-neutral">{l.action}</span></td>
                <td className="py-3 pr-4">{l.entityType ?? '—'} {l.entityId ? `(${l.entityId.slice(0, 8)}...)` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="text-center py-8 text-slate-500">No audit logs yet.</p>}
      </div>
    </div>
  );
}
