'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    organizationName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand">
          OK<span>auto</span>
        </div>
        <p className="muted">Create your dealership organization.</p>
        {error ? <p className="error">{error}</p> : null}
        {(
          [
            ['firstName', 'First name'],
            ['lastName', 'Last name'],
            ['organizationName', 'Organization / dealership'],
            ['email', 'Email'],
            ['password', 'Password (min 10)'],
          ] as const
        ).map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={key}>{label}</label>
            <input
              id={key}
              type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              required
              minLength={key === 'password' ? 10 : undefined}
            />
          </div>
        ))}
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p className="muted" style={{ marginTop: '1rem' }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
