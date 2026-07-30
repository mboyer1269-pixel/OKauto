"use client";

import { useEffect, useState } from "react";
import { api, getStoredSession } from "@/lib/api";
import { DashboardShell } from "@/components/DashboardShell";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const session = getStoredSession();
    if (!session) return;
    const res = await api<{ items: Notification[] }>(
      `/v1/orgs/${session.organizationId}/notifications`,
      { token: session.accessToken },
    );
    setItems(res.items);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function markRead(id: string) {
    const session = getStoredSession();
    if (!session) return;
    await api(`/v1/orgs/${session.organizationId}/notifications/${id}/read`, {
      method: "POST",
      token: session.accessToken,
    });
    await load();
  }

  async function markAll() {
    const session = getStoredSession();
    if (!session) return;
    await api(`/v1/orgs/${session.organizationId}/notifications/read-all`, {
      method: "POST",
      token: session.accessToken,
    });
    await load();
  }

  return (
    <DashboardShell>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 className="display" style={{ fontSize: "2.4rem", margin: 0 }}>
              Alerts
            </h1>
            <p style={{ color: "var(--ink-soft)", margin: "0.35rem 0 0" }}>
              Sold-vehicle and sync alerts so Marketplace stays current.
            </p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => markAll()}>
            Mark all read
          </button>
        </div>
        {error ? <p role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
          {items.length === 0 ? <li className="panel" style={{ padding: "1rem" }}>No alerts yet.</li> : null}
          {items.map((n) => (
            <li key={n.id} className="panel" style={{ padding: "1rem", opacity: n.readAt ? 0.7 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <span className="badge">{n.type}</span>
                  <h2 style={{ margin: "0.4rem 0", fontSize: "1.1rem" }}>{n.title}</h2>
                  <p style={{ margin: 0, color: "var(--ink-soft)" }}>{n.body}</p>
                  <div style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "var(--ink-soft)" }}>
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
                {!n.readAt ? (
                  <button className="btn btn-ghost" type="button" onClick={() => markRead(n.id)}>
                    Mark read
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DashboardShell>
  );
}
