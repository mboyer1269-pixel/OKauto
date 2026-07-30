"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, getStoredSession } from "@/lib/api";
import { DashboardShell } from "@/components/DashboardShell";

type Member = {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
};

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "salesperson" | "viewer">("salesperson");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const session = getStoredSession();
    if (!session) return;
    const res = await api<{ members: Member[] }>(
      `/v1/orgs/${session.organizationId}/members`,
      { token: session.accessToken },
    );
    setMembers(res.members);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function invite(e: FormEvent) {
    e.preventDefault();
    const session = getStoredSession();
    if (!session) return;
    setError(null);
    try {
      const res = await api<{ invite: { token: string; acceptPath: string } }>(
        `/v1/orgs/${session.organizationId}/invites`,
        {
          method: "POST",
          token: session.accessToken,
          body: JSON.stringify({ email, role }),
        },
      );
      setInviteToken(res.invite.token);
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  }

  return (
    <DashboardShell>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <h1 className="display" style={{ fontSize: "2.4rem", margin: 0 }}>
            Team
          </h1>
          <p style={{ color: "var(--ink-soft)", margin: "0.35rem 0 0" }}>
            Invite managers and salespeople. RBAC controls inventory and listing permissions.
          </p>
        </div>
        {error ? <p role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}
        <form className="panel" onSubmit={invite} style={{ padding: "1rem", display: "grid", gap: "0.75rem", maxWidth: 560 }}>
          <h2 style={{ margin: 0 }}>Invite member</h2>
          <label className="field">
            <span>Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="salesperson">Salesperson</option>
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit" style={{ justifySelf: "start" }}>
            Send invite
          </button>
          {inviteToken ? (
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              Invite token (share securely): <code>{inviteToken}</code>
              <br />
              Accept at <code>/accept-invite?token=…</code>
            </p>
          ) : null}
        </form>
        <section className="panel" style={{ padding: "1rem", overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.user.name}</td>
                  <td>{m.user.email}</td>
                  <td>{m.role}</td>
                  <td>
                    <span className="badge">{m.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DashboardShell>
  );
}
