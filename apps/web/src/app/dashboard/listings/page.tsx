'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type Listing = {
  id: string;
  status: string;
  title: string | null;
  price: number | null;
  createdAt: string;
  submittedAt: string | null;
  vehicle: {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    stockNumber: string | null;
  };
  salesperson: { id: string; firstName: string; lastName: string; email: string };
};

export default function ListingsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<{ items: Listing[] }>('/v1/listings', { token })
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [token]);

  return (
    <div className="stack">
      <div>
        <h1>Listings</h1>
        <p className="muted">Marketplace listing history and statuses.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Salesperson</th>
              <th>Status</th>
              <th>Price</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id}>
                <td>
                  <div>{l.title}</div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {l.vehicle.stockNumber} · {l.vehicle.vin}
                  </div>
                </td>
                <td>
                  {l.salesperson.firstName} {l.salesperson.lastName}
                </td>
                <td>
                  <span className={`badge ${l.status}`}>{l.status}</span>
                </td>
                <td>{l.price != null ? `$${l.price.toLocaleString()}` : '—'}</td>
                <td>{new Date(l.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
