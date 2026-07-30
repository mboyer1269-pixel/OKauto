'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/client';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', organizationName: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api('/auth/register', { method: 'POST', body: JSON.stringify(form) });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Registration failed');
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
        <h2>Create your dealership</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>
          Get started in seconds. You will be the organization owner.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="organizationName">
              Dealership name
            </label>
            <input id="organizationName" className="input" required value={form.organizationName} onChange={update('organizationName')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" className="input" required value={form.name} onChange={update('name')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" className="input" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={update('password')} />
            <p className="small muted" style={{ marginTop: 4 }}>
              At least 8 characters.
            </p>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Creating…' : 'Create dealership'}
          </button>
        </form>
        <div className="divider" />
        <p className="small muted">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
