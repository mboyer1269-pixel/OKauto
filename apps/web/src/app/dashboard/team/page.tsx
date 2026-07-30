"use client";

import { useState } from "react";
import { api, ApiClientError, formatDate } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import {
  Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, Spinner, TableShell, Td, Th, inputClass,
} from "@/components/ui";

interface Members {
  members: { userId: string; name: string; email: string; role: string; joinedAt: string }[];
}
interface Salespeople {
  salespeople: {
    userId: string;
    name: string;
    email: string;
    role: string;
    totalListings: number;
    activeListings: number;
    publishedLast7Days: number;
    publishedLast30Days: number;
    lastActivityAt: string | null;
  }[];
}
interface Invites {
  invites: { id: string; email: string; role: string; token: string; acceptedAt: string | null; expiresAt: string }[];
}

export default function TeamPage() {
  const { currentOrg, user } = useSession();
  const orgId = currentOrg?.orgId;
  const isOwner = currentOrg?.role === "OWNER";

  const members = useApi<Members>(orgId ? `/api/v1/orgs/${orgId}/members` : null);
  const stats = useApi<Salespeople>(orgId ? `/api/v1/orgs/${orgId}/analytics/salespeople` : null);
  const invites = useApi<Invites>(orgId ? `/api/v1/orgs/${orgId}/invites` : null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function changeRole(userId: string, role: string) {
    if (!orgId) return;
    setNotice(null);
    try {
      await api(`/api/v1/orgs/${orgId}/members/${userId}`, { method: "PATCH", body: { role } });
      members.reload();
      stats.reload();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Role change failed");
    }
  }

  async function removeMember(userId: string) {
    if (!orgId || !confirm("Remove this member from the dealership?")) return;
    setNotice(null);
    try {
      await api(`/api/v1/orgs/${orgId}/members/${userId}`, { method: "DELETE" });
      members.reload();
      stats.reload();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Removal failed");
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!orgId) return;
    try {
      await api(`/api/v1/orgs/${orgId}/invites/${inviteId}`, { method: "DELETE" });
      invites.reload();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Could not revoke invite");
    }
  }

  const statsByUser = new Map((stats.data?.salespeople ?? []).map((s) => [s.userId, s]));

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Members, roles, invites, and per-salesperson Marketplace activity."
        action={<Button onClick={() => setInviteOpen(true)}>Invite member</Button>}
      />
      {notice && <p className="mb-3 text-sm text-red-600">{notice}</p>}
      <ErrorNote message={members.error} />
      {members.loading && <Spinner />}

      {members.data && (
        <TableShell>
          <thead className="bg-slate-50">
            <tr>
              <Th>Member</Th>
              <Th>Role</Th>
              <Th>Active</Th>
              <Th>7 days</Th>
              <Th>30 days</Th>
              <Th>Total</Th>
              <Th>Last activity</Th>
              {isOwner && <Th>Manage</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.data.members.map((m) => {
              const s = statsByUser.get(m.userId);
              return (
                <tr key={m.userId} className="hover:bg-slate-50">
                  <Td>
                    <div className="font-medium text-slate-800">{m.name}</div>
                    <div className="text-xs text-slate-400">{m.email}</div>
                  </Td>
                  <Td><Badge value={m.role} /></Td>
                  <Td>{s?.activeListings ?? 0}</Td>
                  <Td>{s?.publishedLast7Days ?? 0}</Td>
                  <Td>{s?.publishedLast30Days ?? 0}</Td>
                  <Td>{s?.totalListings ?? 0}</Td>
                  <Td className="text-xs">{s?.lastActivityAt ? formatDate(s.lastActivityAt) : "—"}</Td>
                  {isOwner && (
                    <Td>
                      {m.userId !== user?.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                            value={m.role}
                            onChange={(e) => changeRole(m.userId, e.target.value)}
                            aria-label={`Change role for ${m.name}`}
                          >
                            {["OWNER", "MANAGER", "SALESPERSON"].map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <Button variant="ghost" onClick={() => removeMember(m.userId)}>
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">you</span>
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      {invites.data && invites.data.invites.filter((i) => !i.acceptedAt).length > 0 && (
        <Card title="Pending invites" className="mt-4">
          <ul className="space-y-2">
            {invites.data.invites
              .filter((i) => !i.acceptedAt)
              .map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium text-slate-800">{i.email}</span>{" "}
                    <Badge value={i.role} /> <span className="text-xs text-slate-400">expires {formatDate(i.expiresAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      className="text-xs text-indigo-600 hover:underline"
                      onClick={() => {
                        navigator.clipboard.writeText(i.token);
                        setNotice("Invite token copied to clipboard — share it with the invitee.");
                      }}
                    >
                      Copy token
                    </button>
                    <Button variant="ghost" onClick={() => revokeInvite(i.id)}>
                      Revoke
                    </Button>
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {orgId && (
        <InviteModal
          orgId={orgId}
          open={inviteOpen}
          isOwner={isOwner}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            invites.reload();
          }}
        />
      )}
    </div>
  );
}

function InviteModal({
  orgId,
  open,
  isOwner,
  onClose,
  onInvited,
}: {
  orgId: string;
  open: boolean;
  isOwner: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SALESPERSON");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ invite: { token: string } }>(`/api/v1/orgs/${orgId}/invites`, {
        method: "POST",
        body: { email, role },
      });
      setToken(res.invite.token);
      onInvited();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Invite a team member" open={open} onClose={onClose}>
      {token ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Invite created. Share this token with <strong>{email}</strong> — they enter it after registering, under
            “Join with invite”.
          </p>
          <code className="block break-all rounded-lg bg-slate-100 p-3 text-xs">{token}</code>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(token);
            }}
          >
            Copy token
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <ErrorNote message={error} />
          <Field label="Email">
            <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Role">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="SALESPERSON">Salesperson — lists vehicles, sees own activity</option>
              <option value="MANAGER">Manager — imports, feeds, team analytics</option>
              {isOwner && <option value="OWNER">Owner — full control</option>}
            </select>
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create invite"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
