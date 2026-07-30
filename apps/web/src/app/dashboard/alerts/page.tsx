'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export default function AlertsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    const res = await api<{ items: Notification[] }>('/v1/notifications', { token });
    setItems(res.items);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function markAll() {
    if (!token) return;
    await api('/v1/notifications/read-all', { method: 'POST', token, body: '{}' });
    await load();
  }

  async function markOne(id: string) {
    if (!token) return;
    await api(`/v1/notifications/${id}/read`, { method: 'POST', token, body: '{}' });
    await load();
  }

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Alerts</h1>
          <p className="muted">Sold vehicle and price-change notifications.</p>
        </div>
        <button className="btn secondary" type="button" onClick={() => void markAll()}>
          Mark all read
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="stack">
        {items.map((n) => (
          <div className="panel" key={n.id} style={{ opacity: n.readAt ? 0.7 : 1 }}>
            <div className="topbar" style={{ marginBottom: 0 }}>
              <div>
                <h3 style={{ marginBottom: 4 }}>{n.title}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {n.body}
                </p>
                <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                  {n.type} · {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
              {!n.readAt ? (
                <button className="btn secondary" type="button" onClick={() => void markOne(n.id)}>
                  Acknowledge
                </button>
              ) : (
                <span className="badge">Read</span>
              )}
            </div>
          </div>
        ))}
        {!items.length ? <p className="muted">No alerts.</p> : null}
      </div>
    </div>
  );
}
