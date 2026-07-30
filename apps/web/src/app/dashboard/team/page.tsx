'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';

interface Member {
  id: string;
  role: string;
  user: { id: string; name: string; email: string; isActive: boolean };
}

export default function TeamPage() {
  return (
    <ProtectedRoute>
      <TeamContent />
    </ProtectedRoute>
  );
}

function TeamContent() {
  const { apiFetch, role } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ name: '', email: '', password: '', role: 'SALESPERSON' });
  const [error, setError] = useState('');

  const load = () => {
    apiFetch('/api/v1/organizations/members').then((r) => r.json()).then(setMembers);
  };

  useEffect(() => { load(); }, [apiFetch]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await apiFetch('/api/v1/organizations/members', {
      method: 'POST',
      body: JSON.stringify(invite),
    });
    if (!res.ok) {
      const err = await res.json();
      setError(err.error);
      return;
    }
    setShowInvite(false);
    setInvite({ name: '', email: '', password: '', role: 'SALESPERSON' });
    load();
  };

  const canManage = role === 'OWNER' || role === 'ADMIN';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Team</h1>
        {canManage && (
          <button onClick={() => setShowInvite(!showInvite)} className="btn-primary">Invite Member</button>
        )}
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} className="card mb-6 max-w-md space-y-3">
          {error && <div className="p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
          <input className="input" placeholder="Name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} required />
          <input className="input" type="email" placeholder="Email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
          <input className="input" type="password" placeholder="Temporary Password" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} required minLength={8} />
          <select className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            <option value="SALESPERSON">Salesperson</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button type="submit" className="btn-primary">Send Invite</button>
        </form>
      )}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="pb-3">Name</th>
              <th className="pb-3">Email</th>
              <th className="pb-3">Role</th>
              <th className="pb-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-3 font-medium">{m.user.name}</td>
                <td className="py-3">{m.user.email}</td>
                <td className="py-3"><span className="badge-neutral">{m.role}</span></td>
                <td className="py-3">{m.user.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
