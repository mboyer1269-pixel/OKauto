'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/client';
import { StatusBadge } from '@/components/StatusBadge';
import type { Role } from '@okauto/shared';

interface Listing {
  id: string;
  status: string;
  channel: string;
  externalUrl: string | null;
  updatedAt: string;
  vehicle: { id: string; title: string; priceCents: number | null };
  lister: { id: string; name: string };
}

const STATUSES = ['', 'ACTIVE', 'READY', 'PENDING', 'NEEDS_ATTENTION', 'REMOVED', 'SOLD', 'DRAFT'];

export function ListingsClient({
  orgId,
  role: _role,
  initialStatus,
}: {
  orgId: string;
  role: Role;
  initialStatus?: string;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [status, setStatus] = useState(initialStatus ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Listing[]>(`/orgs/${orgId}/listings?take=200${status ? `&status=${status}` : ''}`);
      setListings(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, [orgId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setListingStatus(id: string, next: string) {
    try {
      await api(`/listings/${id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
      setNotice(`Listing set to ${next}.`);
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Listings</h1>
          <p className="muted">Human-in-the-loop Marketplace listings</p>
        </div>
        <div className="row">
          <label className="label" htmlFor="status-filter" style={{ margin: 0 }}>
            Filter
          </label>
          <select
            id="status-filter"
            className="select"
            style={{ width: 200 }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'All statuses' : s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Salesperson</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && listings.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No listings match this filter.
                  </td>
                </tr>
              )}
              {listings.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.vehicle.title || 'Untitled'}</strong>
                    {l.externalUrl && (
                      <div className="small">
                        <a href={l.externalUrl} target="_blank" rel="noreferrer">
                          View on Marketplace ↗
                        </a>
                      </div>
                    )}
                  </td>
                  <td>{l.lister.name}</td>
                  <td>
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="small muted">{new Date(l.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="row">
                      {l.status !== 'ACTIVE' && (
                        <button className="btn btn-sm" onClick={() => void setListingStatus(l.id, 'ACTIVE')}>
                          Mark active
                        </button>
                      )}
                      {l.status !== 'REMOVED' && (
                        <button className="btn btn-sm btn-danger" onClick={() => void setListingStatus(l.id, 'REMOVED')}>
                          Mark removed
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
