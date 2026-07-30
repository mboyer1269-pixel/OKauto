'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, API_URL } from '@/lib/api';

export default function SettingsPage() {
  const { token, user, memberships } = useAuth();
  const [extToken, setExtToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createExtensionToken() {
    if (!token) return;
    setError(null);
    try {
      const res = await api<{ token: string; expiresAt: string }>('/v1/auth/extension-token', {
        method: 'POST',
        token,
        body: '{}',
      });
      setExtToken(res.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>Settings</h1>
        <p className="muted">Extension connection and workspace details.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="panel stack">
        <h2>Workspace</h2>
        <p>
          Signed in as {user?.email}. Role: {memberships[0]?.role}. API: {API_URL}
        </p>
        <p className="muted">
          Policy: OKauto never bypasses CAPTCHA, authentication, rate limits, or Meta platform
          restrictions. Marketplace posting stays human-in-the-loop.
        </p>
      </div>
      <div className="panel stack">
        <h2>Chrome extension token</h2>
        <p className="muted">
          Generate a revocable API token for the OKauto Chrome extension. Paste it into the
          extension options.
        </p>
        <button className="btn" type="button" onClick={() => void createExtensionToken()}>
          Generate token
        </button>
        {extToken ? (
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              background: 'rgba(0,0,0,0.25)',
              padding: '0.75rem',
              borderRadius: 10,
            }}
          >
            {extToken}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
