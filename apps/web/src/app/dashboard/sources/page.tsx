'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type Source = {
  id: string;
  name: string;
  type: string;
  lastSyncAt: string | null;
  lastStatus: string | null;
  dealership: { id: string; name: string };
  syncRuns: Array<{ id: string; status: string; stats: unknown; error: string | null }>;
};

export default function SourcesPage() {
  const { token, memberships } = useAuth();
  const [items, setItems] = useState<Source[]>([]);
  const [csv, setCsv] = useState(
    `vin,stock,year,make,model,price,mileage,photos\n1N4AL3AP8JC123456,N9001,2018,Nissan,Altima,15990,62000,https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800`,
  );
  const [name, setName] = useState('Manual CSV import');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    const res = await api<{ items: Source[] }>('/v1/inventory/sources', { token });
    setItems(res.items);
    if (res.items[0]) setSourceId(res.items[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function createAndImport(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      let id = sourceId;
      if (!id) {
        const created = await api<{ id: string }>('/v1/inventory/sources', {
          method: 'POST',
          token,
          body: JSON.stringify({
            dealershipId: memberships[0]?.dealership?.id,
            name,
            type: 'csv',
            config: {},
          }),
        });
        id = created.id;
        setSourceId(id);
      }
      const res = await api<{ stats: { created: number; updated: number; skipped: number } }>(
        `/v1/inventory/sources/${id}/import`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({ content: csv, contentType: 'csv' }),
        },
      );
      setMessage(
        `Import complete — created ${res.stats.created}, updated ${res.stats.updated}, skipped ${res.stats.skipped}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>Inventory sources</h1>
        <p className="muted">CSV / XML / website sync health and manual import.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}
      <form className="panel stack" onSubmit={createAndImport}>
        <div className="field">
          <label htmlFor="name">Source name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="csv">CSV content</label>
          <textarea id="csv" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} />
        </div>
        <button className="btn" type="submit">
          Import CSV
        </button>
      </form>
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Last sync</th>
              <th>Status</th>
              <th>Last run</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.type}</td>
                <td>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : '—'}</td>
                <td>
                  <span className={`badge ${s.lastStatus ?? ''}`}>{s.lastStatus ?? 'n/a'}</span>
                </td>
                <td>
                  {s.syncRuns[0]
                    ? `${s.syncRuns[0].status}${s.syncRuns[0].error ? ` — ${s.syncRuns[0].error}` : ''}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
