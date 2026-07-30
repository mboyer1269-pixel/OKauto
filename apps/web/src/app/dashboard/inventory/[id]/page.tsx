'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatCurrency, formatNumber, getStatusBadgeClass, formatDateTime } from '@/lib/utils';
import { PhotoManager } from '@/components/photo-manager';
import { Sparkles, Search } from 'lucide-react';

export default function VehicleDetailPage() {
  return (
    <ProtectedRoute>
      <VehicleDetail />
    </ProtectedRoute>
  );
}

function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/v1/vehicles/${id}`);
    if (res.ok) setVehicle(await res.json());
    setLoading(false);
  }, [apiFetch, id]);

  useEffect(() => { load(); }, [load]);

  const handleDecodeVin = async () => {
    const res = await apiFetch(`/api/v1/vehicles/${id}/decode-vin`, { method: 'POST' });
    if (res.ok) load();
    else {
      const err = await res.json();
      alert(err.error);
    }
  };

  const handleGenerateDesc = async () => {
    await apiFetch(`/api/v1/vehicles/${id}/generate-description`, { method: 'POST' });
    load();
  };

  const handleMarkSold = async () => {
    await apiFetch(`/api/v1/vehicles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'SOLD' }),
    });
    load();
  };

  if (loading) return <div className="animate-pulse h-64 bg-slate-200 rounded-xl" />;
  if (!vehicle) return <div className="card">Vehicle not found</div>;

  const photos = (vehicle.photos as Array<{ id: string; url: string; isPrimary: boolean }>) ?? [];
  const listings = (vehicle.listings as Array<Record<string, unknown>>) ?? [];

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-brand-600 mb-4 hover:underline">← Back to Inventory</button>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/3">
          <div className="card">
            {photos[0] ? (
              <img src={photos[0].url} alt="" className="w-full rounded-lg mb-4" />
            ) : (
              <div className="w-full h-48 bg-slate-100 rounded-lg mb-4" />
            )}
            <h1 className="text-xl font-bold">
              {String(vehicle.year)} {String(vehicle.make)} {String(vehicle.model)} {String(vehicle.trim ?? '')}
            </h1>
            <p className="text-2xl font-bold text-brand-600 mt-2">{formatCurrency(vehicle.price as number)}</p>
            <span className={`${getStatusBadgeClass(vehicle.status as string)} mt-2`}>{vehicle.status as string}</span>
            <div className="mt-4 space-y-2 text-sm">
              <p><strong>Stock:</strong> {(vehicle.stockNumber as string) ?? '—'}</p>
              <p><strong>VIN:</strong> {(vehicle.vin as string) ?? '—'}</p>
              <p><strong>Mileage:</strong> {formatNumber(vehicle.mileage as number)} mi</p>
              <p><strong>Color:</strong> {(vehicle.exteriorColor as string) ?? '—'}</p>
              <p><strong>Transmission:</strong> {(vehicle.transmission as string) ?? '—'}</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {Boolean(vehicle.vin) && (
                <button onClick={handleDecodeVin} className="btn-secondary text-xs">
                  <Search size={14} className="mr-1" /> Decode VIN
                </button>
              )}
              <button onClick={handleGenerateDesc} className="btn-secondary text-xs">
                <Sparkles size={14} className="mr-1" /> Generate Description
              </button>
              {vehicle.status !== 'SOLD' && (
                <button onClick={handleMarkSold} className="btn-danger text-xs">Mark Sold</button>
              )}
            </div>
          </div>
        </div>
        <div className="lg:w-2/3 space-y-6">
          <PhotoManager vehicleId={id} photos={photos} onUpdate={load} />
          <div className="card">
            <h2 className="font-semibold mb-3">Description</h2>
            <p className="text-sm whitespace-pre-wrap">{(vehicle.description as string) ?? 'No description yet.'}</p>
          </div>
          <div className="card">
            <h2 className="font-semibold mb-3">Listing History</h2>
            {listings.length === 0 ? (
              <p className="text-sm text-slate-500">No listings yet.</p>
            ) : (
              <div className="space-y-2">
                {listings.map((l) => (
                  <div key={l.id as string} className="flex justify-between text-sm border-b pb-2">
                    <span>{(l.user as { name: string })?.name} · <span className={getStatusBadgeClass(l.status as string)}>{l.status as string}</span></span>
                    <span className="text-slate-500">{formatDateTime(l.listedAt as string)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
