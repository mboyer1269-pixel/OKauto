'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import Link from 'next/link';

type VehicleDetail = {
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
  description: string | null;
  aiDescription: string | null;
  exteriorColor: string | null;
  media: Array<{ id: string; url: string; sortOrder: number }>;
  listings: Array<{ id: string; status: string; createdAt: string }>;
};

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!token) return;
    const v = await api<VehicleDetail>(`/v1/vehicles/${id}`, { token });
    setVehicle(v);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function regenerate() {
    if (!token || !vehicle) return;
    setBusy(true);
    try {
      const res = await api<{ description: string }>(`/v1/vehicles/${vehicle.id}/descriptions`, {
        method: 'POST',
        token,
        body: '{}',
      });
      setVehicle({ ...vehicle, aiDescription: res.description });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  if (!vehicle) {
    return <p className="muted">{error ?? 'Loading…'}</p>;
  }

  return (
    <div className="stack">
      <Link className="muted" href="/dashboard/inventory">
        ← Inventory
      </Link>
      <div className="topbar">
        <div>
          <h1>
            {[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')}
          </h1>
          <p className="muted">
            {vehicle.stockNumber} · {vehicle.vin}
          </p>
        </div>
        <span className={`badge ${vehicle.status}`}>{vehicle.status}</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
        <div className="panel">
          <h2>Photos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem' }}>
            {vehicle.media.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.url}
                alt=""
                style={{ width: '100%', borderRadius: 10, aspectRatio: '16/10', objectFit: 'cover' }}
              />
            ))}
          </div>
        </div>
        <div className="stack">
          <div className="panel">
            <h2>Details</h2>
            <p>Price: {vehicle.price != null ? `$${vehicle.price.toLocaleString()}` : '—'}</p>
            <p>Mileage: {vehicle.mileage?.toLocaleString() ?? '—'}</p>
            <p>Color: {vehicle.exteriorColor ?? '—'}</p>
          </div>
          <div className="panel">
            <div className="topbar" style={{ marginBottom: '0.5rem' }}>
              <h2>AI description</h2>
              <button className="btn secondary" type="button" disabled={busy} onClick={() => void regenerate()}>
                {busy ? 'Generating…' : 'Regenerate'}
              </button>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
              {vehicle.aiDescription || vehicle.description || 'No description yet.'}
            </pre>
          </div>
          <div className="panel">
            <h2>Listing history</h2>
            <ul>
              {vehicle.listings.map((l) => (
                <li key={l.id}>
                  <Link href={`/dashboard/listings`}>{l.id.slice(0, 8)}</Link> · {l.status} ·{' '}
                  {new Date(l.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
