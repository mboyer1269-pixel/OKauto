"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { formatDate, humanize } from "@/lib/format";

interface Member {
  id: string;
  role: string;
  status: string;
  user: { id: string; email: string; name: string; status: string };
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export default function TeamPage() {
  const { api, activeRole, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("SALESPERSON");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canManage = activeRole === "ORG_OWNER" || activeRole === "ORG_MANAGER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ members: Member[]; invites: Invite[] }>("/members");
      setMembers(res.members);
      setInvites(res.invites);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendInvite = async () => {
    setMessage(null);
    setInviteLink(null);
    try {
      const res = await api<{ inviteUrl: string }>("/invites", {
        method: "POST",
        body: { email: inviteEmail, role: inviteRole },
      });
      // API returns API-base URL; rewrite to the dashboard invite route for sharing.
      const token = res.inviteUrl.split("/invite/")[1];
      setInviteLink(`${window.location.origin}/invite/${token}`);
      setInviteEmail("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Invite failed");
    }
  };

  const updateMember = async (id: string, patch: { role?: string; status?: string }) => {
    setMessage(null);
    try {
      await api(`/members/${id}`, { method: "PATCH", body: patch });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    }
  };

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Team" />
        <Card>
          <p className="text-sm text-ink-400">Only owners and managers can manage the team.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Team" subtitle="Members, roles, and invitations" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-bold">Members</h2>
          {loading ? (
            <Spinner />
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-900/60 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {m.user.name} {m.user.id === user?.id ? <span className="text-xs text-ink-400">(you)</span> : null}
                    </p>
                    <p className="text-xs text-ink-400">{m.user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge colorClass={m.status === "ACTIVE" ? "bg-emerald-900/60 text-emerald-300" : "bg-ink-700/60 text-ink-200"}>
                      {humanize(m.status)}
                    </Badge>
                    <Select
                      aria-label={`Role for ${m.user.name}`}
                      value={m.role}
                      disabled={m.user.id === user?.id && m.role === "ORG_OWNER"}
                      onChange={(e) => void updateMember(m.id, { role: e.target.value })}
                    >
                      <option value="ORG_OWNER">Owner</option>
                      <option value="ORG_MANAGER">Manager</option>
                      <option value="SALESPERSON">Salesperson</option>
                    </Select>
                    {m.user.id !== user?.id ? (
                      <Button
                        size="sm"
                        variant={m.status === "ACTIVE" ? "danger" : "secondary"}
                        onClick={() => void updateMember(m.id, { status: m.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE" })}
                      >
                        {m.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {message ? <p role="alert" className="mt-3 text-sm text-red-300">{message}</p> : null}
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold">Invite a teammate</h2>
            <div className="space-y-3">
              <Field label="Email">
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@dealer.com" />
              </Field>
              <Field label="Role">
                <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full">
                  <option value="SALESPERSON">Salesperson</option>
                  <option value="ORG_MANAGER">Manager</option>
                </Select>
              </Field>
              <Button onClick={() => void sendInvite()} disabled={!inviteEmail.includes("@")} className="w-full">
                Create invite link
              </Button>
              {inviteLink ? (
                <div className="rounded-lg bg-brand-900/30 p-3" role="status">
                  <p className="text-xs font-semibold text-brand-300">Share this link (valid 7 days):</p>
                  <p className="mt-1 select-all break-all font-mono text-xs text-ink-200">{inviteLink}</p>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Pending invites</h2>
            {invites.length === 0 ? (
              <p className="text-sm text-ink-400">None.</p>
            ) : (
              <ul className="space-y-2">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{i.email}</p>
                      <p className="text-xs text-ink-400">{humanize(i.role)} • expires {formatDate(i.expiresAt)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void api(`/invites/${i.id}`, { method: "DELETE" }).then(load)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
