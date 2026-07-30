'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/client';

function AcceptInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api('/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token, name: name || undefined, password: password || undefined }),
      });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to accept invite');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <div className="brand" style={{ marginBottom: 8 }}>
          OK<span>auto</span>
        </div>
        <h2>Accept your invite</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>
          If you are new, set a name and password to create your account. If you already have an account, log in
          first, then submit.
        </p>
        {!token && <div className="alert alert-error">Missing invite token.</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label className="label">Name (new accounts)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Password (new accounts)</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !token} style={{ width: '100%' }}>
            {loading ? 'Joining…' : 'Accept invite'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<div className="auth-wrap">Loading…</div>}>
      <AcceptInner />
    </Suspense>
  );
}
