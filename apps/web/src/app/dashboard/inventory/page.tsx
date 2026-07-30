'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatCurrency, formatNumber, getStatusBadgeClass } from '@/lib/utils';
import { Search, Plus, Upload, Sparkles } from 'lucide-react';

interface Vehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  mileage: number;
  price: number;
  status: string;
  stockNumber: string;
  vin: string;
  photos: Array<{ url: string; isPrimary: boolean }>;
  assignedTo: { name: string } | null;
  _count: { listings: number };
}

export default function InventoryPage() {
  return (
    <ProtectedRoute>
      <InventoryContent />
    </ProtectedRoute>
  );
}

function InventoryContent() {
  const { apiFetch } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    const res = await apiFetch(`/api/v1/vehicles?${params}`);
    const data = await res.json();
    setVehicles(data.vehicles ?? []);
    setLoading(false);
  }, [apiFetch, search, status]);

  useEffect(() => { load(); }, [load]);

  const handleImport = async () => {
    setImporting(true);
    const res = await apiFetch('/api/v1/vehicles/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    });
    const data = await res.json();
    setImporting(false);
    setShowImport(false);
    setCsv('');
    alert(`Imported ${data.imported} vehicles. ${data.errors?.length ?? 0} errors.`);
    load();
  };

  const handleGenerateDesc = async (id: string) => {
    await apiFetch(`/api/v1/vehicles/${id}/generate-description`, { method: 'POST' });
    load();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(!showImport)} className="btn-secondary">
            <Upload size={16} className="mr-2" /> Import CSV
          </button>
          <Link href="/dashboard/inventory/new" className="btn-primary">
            <Plus size={16} className="mr-2" /> Add Vehicle
          </Link>
        </div>
      </div>

      {showImport && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-2">Import CSV</h3>
          <p className="text-sm text-slate-500 mb-3">
            Columns: vin, stockNumber, year, make, model, trim, mileage, price, exteriorColor, transmission, fuelType, description
          </p>
          <textarea className="input h-32 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="vin,stockNumber,year,make,model,trim,mileage,price&#10;1HGBH41JXMN109186,STK001,2022,Honda,Accord,Sport,25000,24995" />
          <button onClick={handleImport} className="btn-primary mt-3" disabled={importing || !csv}>
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input className="input pl-9" placeholder="Search by make, model, VIN, stock..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="AVAILABLE">Available</option>
          <option value="PENDING">Pending</option>
          <option value="SOLD">Sold</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}</div>
      ) : vehicles.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">No vehicles found. Add your first vehicle or import a CSV.</div>
      ) : (
        <div className="space-y-3">
          {vehicles.map((v) => (
            <div key={v.id} className="card flex items-center gap-4">
              <div className="w-20 h-14 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                {v.photos?.[0] && <img src={v.photos[0].url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/dashboard/inventory/${v.id}`} className="font-semibold hover:text-brand-600">
                  {v.year} {v.make} {v.model} {v.trim}
                </Link>
                <p className="text-sm text-slate-500">
                  Stock: {v.stockNumber ?? '—'} · {formatNumber(v.mileage)} mi · {v._count.listings} listings
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(v.price)}</p>
                <span className={getStatusBadgeClass(v.status)}>{v.status}</span>
              </div>
              <button onClick={() => handleGenerateDesc(v.id)} className="btn-secondary text-xs" title="Generate AI description">
                <Sparkles size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
