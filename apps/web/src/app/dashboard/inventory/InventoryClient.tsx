'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/client';
import { StatusBadge } from '@/components/StatusBadge';
import { can, type Role } from '@okauto/shared';

interface Vehicle {
  id: string;
  title: string;
  vin: string | null;
  stockNumber: string | null;
  status: string;
  priceCents: number | null;
  mileage: number | null;
  _count: { listings: number };
  photos: { url: string }[];
}

function money(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

export function InventoryClient({ orgId, role }: { orgId: string; role: Role }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const canWrite = can(role, 'vehicle:create');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ items: Vehicle[]; total: number }>(
        `/orgs/${orgId}/vehicles?take=100${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      );
      setVehicles(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [orgId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markSold(id: string) {
    if (!confirm('Mark this vehicle sold and flag its listings for takedown?')) return;
    try {
      const res = await api<{ listingsFlagged: number }>(`/vehicles/${id}/mark-sold`, { method: 'POST' });
      setNotice(`Marked sold. ${res.listingsFlagged} listing(s) flagged for takedown.`);
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  async function reprice(id: string, current: number | null) {
    const input = prompt('New price (USD):', current !== null ? String(current / 100) : '');
    if (input === null) return;
    try {
      const res = await api<{ listingsFlagged: number }>(`/vehicles/${id}/reprice`, {
        method: 'POST',
        body: JSON.stringify({ price: input }),
      });
      setNotice(`Repriced. ${res.listingsFlagged} listing(s) flagged.`);
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  async function createListing(id: string) {
    try {
      await api(`/orgs/${orgId}/listings`, { method: 'POST', body: JSON.stringify({ vehicleId: id }) });
      setNotice('Listing created (READY). Open the extension on Marketplace to pre-fill and post.');
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this vehicle and its listings?')) return;
    try {
      await api(`/vehicles/${id}`, { method: 'DELETE' });
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <p className="muted">{total} vehicles</p>
        </div>
        {canWrite && (
          <div className="row">
            <button className="btn" onClick={() => setShowImport(true)}>
              Import CSV/JSON
            </button>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              Add vehicle
            </button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Search title, VIN, stock, make, model…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <button className="btn btn-sm" onClick={() => void load()}>
            Search
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>VIN / Stock</th>
                <th>Price</th>
                <th>Status</th>
                <th>Listings</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && vehicles.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No vehicles found. Import a CSV or add one manually.
                  </td>
                </tr>
              )}
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.title || 'Untitled'}</strong>
                    <div className="small muted">{money(v.priceCents)} · {v.mileage ? `${v.mileage.toLocaleString()} mi` : 'mileage n/a'}</div>
                  </td>
                  <td className="small muted">
                    {v.vin ?? '—'}
                    <br />
                    {v.stockNumber ?? ''}
                  </td>
                  <td>{money(v.priceCents)}</td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                  <td>{v._count.listings}</td>
                  <td>
                    {canWrite && (
                      <div className="row">
                        <button className="btn btn-sm" onClick={() => void createListing(v.id)}>
                          List
                        </button>
                        <button className="btn btn-sm" onClick={() => void reprice(v.id, v.priceCents)}>
                          Reprice
                        </button>
                        <button className="btn btn-sm" onClick={() => void markSold(v.id)}>
                          Mark sold
                        </button>
                        {can(role, 'vehicle:delete') && (
                          <button className="btn btn-sm btn-danger" onClick={() => void remove(v.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && (
        <ImportModal
          orgId={orgId}
          onClose={() => setShowImport(false)}
          onDone={(msg) => {
            setShowImport(false);
            setNotice(msg);
            void load();
          }}
        />
      )}
      {showAdd && (
        <AddVehicleModal
          orgId={orgId}
          onClose={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 50,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: '100%', maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const SAMPLE_CSV =
  'vin,stockNumber,year,make,model,trim,mileage,price,fuelType,transmission,features\n' +
  '1HGCM82633A004352,A1001,2003,Honda,Accord,EX,120000,8995,gas,automatic,"Leather;Sunroof"\n' +
  ',A1002,2018,Toyota,RAV4,LE,63000,18995,gas,automatic,"AWD;Backup Camera"';

function ImportModal({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [content, setContent] = useState(SAMPLE_CSV);
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ createdCount: number; updatedCount: number; duplicateCount: number; errorCount: number }>(
        `/orgs/${orgId}/vehicles/import`,
        { method: 'POST', body: JSON.stringify({ format, content }) },
      );
      onDone(
        `Import complete — created ${res.createdCount}, updated ${res.updatedCount}, duplicates ${res.duplicateCount}, errors ${res.errorCount}.`,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Import inventory" onClose={onClose}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field">
        <label className="label">Format</label>
        <select className="select" value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}>
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
        </select>
      </div>
      <div className="field">
        <label className="label">Paste {format.toUpperCase()} content</label>
        <textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} rows={10} />
      </div>
      <button className="btn btn-primary" onClick={() => void submit()} disabled={loading}>
        {loading ? 'Importing…' : 'Import'}
      </button>
    </Modal>
  );
}

function AddVehicleModal({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ vin: '', stockNumber: '', year: '', make: '', model: '', trim: '', mileage: '', price: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await api(`/orgs/${orgId}/vehicles`, { method: 'POST', body: JSON.stringify(form) });
      onDone();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to add vehicle');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Add vehicle" onClose={onClose}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="grid grid-2">
        <div className="field">
          <label className="label">Year</label>
          <input className="input" value={form.year} onChange={update('year')} />
        </div>
        <div className="field">
          <label className="label">Make</label>
          <input className="input" value={form.make} onChange={update('make')} />
        </div>
        <div className="field">
          <label className="label">Model</label>
          <input className="input" value={form.model} onChange={update('model')} />
        </div>
        <div className="field">
          <label className="label">Trim</label>
          <input className="input" value={form.trim} onChange={update('trim')} />
        </div>
        <div className="field">
          <label className="label">VIN</label>
          <input className="input" value={form.vin} onChange={update('vin')} />
        </div>
        <div className="field">
          <label className="label">Stock #</label>
          <input className="input" value={form.stockNumber} onChange={update('stockNumber')} />
        </div>
        <div className="field">
          <label className="label">Mileage</label>
          <input className="input" value={form.mileage} onChange={update('mileage')} />
        </div>
        <div className="field">
          <label className="label">Price (USD)</label>
          <input className="input" value={form.price} onChange={update('price')} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={() => void submit()} disabled={loading}>
        {loading ? 'Saving…' : 'Add vehicle'}
      </button>
    </Modal>
  );
}
