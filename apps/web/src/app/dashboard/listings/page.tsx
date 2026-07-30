'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatCurrency, formatDateTime, getStatusBadgeClass } from '@/lib/utils';

interface Listing {
  id: string;
  status: string;
  listedAt: string;
  priceAtListing: number;
  vehicle: { year: number; make: string; model: string; photos: Array<{ url: string }> };
  user: { name: string };
}

export default function ListingsPage() {
  return (
    <ProtectedRoute>
      <ListingsContent />
    </ProtectedRoute>
  );
}

function ListingsContent() {
  const { apiFetch } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    apiFetch(`/api/v1/listings?${params}`)
      .then((r) => r.json())
      .then((d) => setListings(d.listings ?? []))
      .finally(() => setLoading(false));
  }, [apiFetch, status]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Listings</h1>
      <select className="input w-auto mb-6" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All Status</option>
        <option value="ACTIVE">Active</option>
        <option value="STALE">Stale</option>
        <option value="REMOVED">Removed</option>
        <option value="SOLD">Sold</option>
      </select>

      {loading ? (
        <div className="animate-pulse h-32 bg-slate-200 rounded-xl" />
      ) : listings.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">No listings yet. Use the Chrome extension to create listings.</div>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => (
            <div key={l.id} className="card flex items-center gap-4">
              <div className="w-16 h-12 bg-slate-100 rounded overflow-hidden">
                {l.vehicle.photos?.[0] && <img src={l.vehicle.photos[0].url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{l.vehicle.year} {l.vehicle.make} {l.vehicle.model}</p>
                <p className="text-sm text-slate-500">by {l.user.name} · {formatDateTime(l.listedAt)}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(l.priceAtListing)}</p>
                <span className={getStatusBadgeClass(l.status)}>{l.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
