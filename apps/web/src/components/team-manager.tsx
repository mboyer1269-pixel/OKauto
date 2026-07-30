"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { Card, CardHeader, StatusBadge } from "@/components/ui";
import { dateTime } from "@/lib/format";

interface MemberRow {
  userId: string;
  role: string;
  name: string;
  email: string;
  joinedAt: string;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export function TeamManager({
  orgId,
  currentUserId,
  actorRole,
  members,
  invitations,
}: {
  orgId: string;
  currentUserId: string;
  actorRole: string;
  members: MemberRow[];
  invitations: InviteRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = actorRole === "OWNER";

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setInviteUrl(null);
    try {
      const data = await api<{ invitation: { acceptUrl: string } }>(
        `/api/v1/orgs/${orgId}/invitations`,
        { method: "POST", json: { email: form.get("email"), role: form.get("role") } },
      );
      setInviteUrl(data.invitation.acceptUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/members/${userId}`, { method: "PATCH", json: { role } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Role change failed");
    }
  }

  async function removeMember(member: MemberRow) {
    if (!window.confirm(`Remove ${member.name} from the dealership?`)) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/members/${member.userId}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Remove failed");
    }
  }

  async function revokeInvite(id: string) {
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/invitations/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Revoke failed");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Team</h1>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Invite a teammate"
          subtitle="Share the generated link — it expires in 7 days"
        />
        <form onSubmit={invite} className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="invite-email">
              Email
            </label>
            <input className="input" id="invite-email" name="email" type="email" required />
          </div>
          <div>
            <label className="label" htmlFor="invite-role">
              Role
            </label>
            <select className="input" id="invite-role" name="role" defaultValue="SALESPERSON">
              <option value="SALESPERSON">Salesperson</option>
              {isOwner ? <option value="MANAGER">Manager</option> : null}
              {isOwner ? <option value="OWNER">Owner</option> : null}
            </select>
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Inviting…" : "Create invite"}
          </button>
        </form>
        {inviteUrl ? (
          <div className="border-t border-slate-100 px-5 py-3" role="status">
            <p className="text-sm font-medium text-emerald-700">
              Invite created — share this link:
            </p>
            <div className="mt-1 flex gap-2">
              <input
                className="input font-mono text-xs"
                readOnly
                value={inviteUrl}
                aria-label="Invite link"
              />
              <button
                className="btn-secondary"
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
                type="button"
              >
                Copy
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title={`Members (${members.length})`} />
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {m.name}
                  {m.userId === currentUserId ? (
                    <span className="ml-1 text-xs text-slate-400">(you)</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  {m.email} · joined {dateTime(m.joinedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {m.userId !== currentUserId && (isOwner || m.role === "SALESPERSON") ? (
                  <>
                    <label className="sr-only" htmlFor={`role-${m.userId}`}>
                      Role for {m.name}
                    </label>
                    <select
                      id={`role-${m.userId}`}
                      className="input w-auto py-1.5"
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value)}
                    >
                      <option value="SALESPERSON">Salesperson</option>
                      {isOwner ? <option value="MANAGER">Manager</option> : null}
                      {isOwner ? <option value="OWNER">Owner</option> : null}
                    </select>
                    <button className="btn-secondary" onClick={() => removeMember(m)}>
                      Remove
                    </button>
                  </>
                ) : (
                  <StatusBadge status={m.role} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader title={`Pending invitations (${invitations.length})`} />
          <ul className="divide-y divide-slate-100">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{i.email}</p>
                  <p className="text-xs text-slate-500">
                    {i.role.toLowerCase()} · expires {dateTime(i.expiresAt)}
                  </p>
                </div>
                <button className="btn-secondary" onClick={() => revokeInvite(i.id)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
