'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type Vehicle = {
  id: string;
  vin: string | null;
  stockNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null;
  mileage: number | null;
  status: string;
  media: Array<{ url: string }>;
};

export default function InventoryPage() {
  const { token, memberships } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const dealershipId = memberships[0]?.dealership?.id;
    if (dealershipId) params.set('dealershipId', dealershipId);
    const res = await api<{ items: Vehicle[]; total: number }>(`/v1/vehicles?${params}`, { token });
    setItems(res.items);
    setTotal(res.total);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
  }

  async function prepare(id: string) {
    if (!token) return;
    setBusyId(id);
    setMessage(null);
    try {
      const res = await api<{ listingId: string; payload: { title: string } }>(
        `/v1/vehicles/${id}/prepare-listing`,
        { method: 'POST', token, body: JSON.stringify({ regenerateDescription: true }) },
      );
      setMessage(`Prepared listing ${res.listingId} — ${res.payload.title}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prepare failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Inventory</h1>
          <p className="muted">{total} vehicles</p>
        </div>
      </div>
      <form className="toolbar" onSubmit={onSearch}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label htmlFor="q">Search</label>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="VIN, stock, make…"
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="available">Available</option>
            <option value="listed">Listed</option>
            <option value="sold">Sold</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <button className="btn secondary" type="submit">
          Filter
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}
      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Stock / VIN</th>
              <th>Price</th>
              <th>Miles</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link href={`/dashboard/inventory/${v.id}`}>
                    {[v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')}
                  </Link>
                </td>
                <td>
                  <div>{v.stockNumber ?? '—'}</div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {v.vin ?? '—'}
                  </div>
                </td>
                <td>{v.price != null ? `$${v.price.toLocaleString()}` : '—'}</td>
                <td>{v.mileage != null ? v.mileage.toLocaleString() : '—'}</td>
                <td>
                  <span className={`badge ${v.status}`}>{v.status}</span>
                </td>
                <td>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={busyId === v.id || v.status === 'sold'}
                    onClick={() => void prepare(v.id)}
                  >
                    {busyId === v.id ? 'Preparing…' : 'Prepare listing'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
