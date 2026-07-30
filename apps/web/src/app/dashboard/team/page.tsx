'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; firstName: string; lastName: string; isActive: boolean };
  dealership: { id: string; name: string } | null;
};

export default function TeamPage() {
  const { token, memberships } = useAuth();
  const [items, setItems] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('salesperson');
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    const res = await api<{ items: Member[] }>('/v1/members', { token });
    setItems(res.items);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const res = await api<{ acceptToken: string; acceptPath: string }>('/v1/invites', {
        method: 'POST',
        token,
        body: JSON.stringify({
          email,
          role,
          dealershipId: memberships[0]?.dealership?.id,
        }),
      });
      setInviteResult(`Invite token (share securely): ${res.acceptToken}`);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>Team</h1>
        <p className="muted">Members and invitations (RBAC).</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {inviteResult ? <p className="muted">{inviteResult}</p> : null}
      <form className="panel toolbar" onSubmit={invite}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label htmlFor="email">Invite email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="role">Role</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="salesperson">Salesperson</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button className="btn" type="submit">
          Invite
        </button>
      </form>
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Rooftop</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.user.firstName} {m.user.lastName}
                </td>
                <td>{m.user.email}</td>
                <td>
                  <span className="badge">{m.role}</span>
                </td>
                <td>{m.dealership?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
