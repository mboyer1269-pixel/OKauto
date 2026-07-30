'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/client';
import { can, ROLES, type Role } from '@okauto/shared';

interface Member {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
}
interface Invite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
}

const ASSIGNABLE = ROLES.filter((r) => r !== 'SUPERADMIN');

export function TeamClient({ orgId, role, selfId }: { orgId: string; role: Role; selfId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('SALESPERSON');
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const canManage = can(role, 'member:invite');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, i] = await Promise.all([
        api<Member[]>(`/orgs/${orgId}/members`),
        canManage ? api<Invite[]>(`/orgs/${orgId}/invites`) : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvites(i);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load team');
    }
  }, [orgId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteLink(null);
    try {
      const res = await api<{ acceptUrl: string }>(`/orgs/${orgId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email, role: inviteRole }),
      });
      setInviteLink(res.acceptUrl);
      setEmail('');
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to invite');
    }
  }

  async function changeRole(membershipId: string, newRole: Role) {
    try {
      await api(`/members/${membershipId}`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  async function removeMember(membershipId: string) {
    if (!confirm('Remove this member from the organization?')) return;
    try {
      await api(`/members/${membershipId}`, { method: 'DELETE' });
      void load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted">Manage members and roles</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {canManage && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Invite a teammate</h3>
          <form className="row" onSubmit={invite}>
            <input
              className="input"
              type="email"
              placeholder="teammate@dealership.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ maxWidth: 300 }}
            />
            <select className="select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} style={{ width: 180 }}>
              {ASSIGNABLE.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit">
              Send invite
            </button>
          </form>
          {inviteLink && (
            <div className="alert alert-success" style={{ marginTop: 12 }}>
              Invite created. Share this link (also emailed in production):
              <br />
              <code style={{ wordBreak: 'break-all' }}>{inviteLink}</code>
            </div>
          )}
          {invites.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="label">Pending invites</p>
              <ul className="list-reset small muted">
                {invites.map((i) => (
                  <li key={i.id}>
                    {i.email} · {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Members</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membershipId}>
                  <td>
                    {m.name} {m.userId === selfId && <span className="pill">you</span>}
                  </td>
                  <td className="small muted">{m.email}</td>
                  <td>
                    {canManage && can(role, 'member:update') ? (
                      <select
                        className="select"
                        style={{ width: 160 }}
                        value={m.role}
                        onChange={(e) => void changeRole(m.membershipId, e.target.value as Role)}
                      >
                        {ASSIGNABLE.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      m.role
                    )}
                  </td>
                  <td>
                    {canManage && can(role, 'member:remove') && m.userId !== selfId && (
                      <button className="btn btn-sm btn-danger" onClick={() => void removeMember(m.membershipId)}>
                        Remove
                      </button>
                    )}
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
