'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/client';

interface Token {
  id: string;
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function SettingsClient({ orgName, orgId }: { orgName: string; orgId: string }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState('My Chrome extension');
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState('');

  useEffect(() => {
    setApiBase(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    try {
      setTokens(await api<Token[]>('/me/tokens'));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load tokens');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ token: string }>('/me/tokens', { method: 'POST', body: JSON.stringify({ label }) });
      setFreshToken(res.token);
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create token');
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this device token? The extension using it will stop working.')) return;
    try {
      await api(`/me/tokens/${id}`, { method: 'DELETE' });
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">{orgName}</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Connect the Chrome extension</h3>
        <p className="muted small">
          Create a device token, then paste it (with the API URL and organization ID below) into the OKauto
          extension options to pair it. The extension pre-fills the Marketplace composer — you always review
          and post manually.
        </p>
        <div className="grid grid-2" style={{ marginTop: 8 }}>
          <div className="field">
            <label className="label">API URL</label>
            <input className="input" readOnly value={apiBase} />
          </div>
          <div className="field">
            <label className="label">Organization ID</label>
            <input className="input" readOnly value={orgId} />
          </div>
        </div>

        <form className="row" onSubmit={create}>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} style={{ maxWidth: 300 }} />
          <button className="btn btn-primary" type="submit">
            Create device token
          </button>
        </form>

        {freshToken && (
          <div className="alert alert-success" style={{ marginTop: 12 }}>
            Copy this token now — it is shown only once:
            <br />
            <code style={{ wordBreak: 'break-all' }}>{freshToken}</code>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Device tokens</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Last used</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No device tokens yet.
                  </td>
                </tr>
              )}
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td className="small muted">{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : 'never'}</td>
                  <td className="small muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => void revoke(t.id)}>
                      Revoke
                    </button>
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
