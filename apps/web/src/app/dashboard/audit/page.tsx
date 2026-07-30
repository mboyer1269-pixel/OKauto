'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type Audit = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  actor: { email: string; firstName: string; lastName: string } | null;
};

export default function AuditPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Audit[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<{ items: Audit[] }>('/v1/audit-logs', { token })
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [token]);

  return (
    <div className="stack">
      <div>
        <h1>Audit log</h1>
        <p className="muted">Privileged actions across the organization.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : '—'}</td>
                <td>{a.action}</td>
                <td>
                  {a.entityType} {a.entityId?.slice(0, 8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
