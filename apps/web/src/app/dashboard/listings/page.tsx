"use client";

import { useEffect, useState } from "react";
import { api, getStoredSession } from "@/lib/api";
import { DashboardShell } from "@/components/DashboardShell";

type Listing = {
  id: string;
  title: string;
  status: string;
  channel: string;
  priceCents: number;
  createdAt: string;
  postedAt: string | null;
  user: { name: string; email: string };
  vehicle: { stockNumber: string | null; vin: string | null };
};

export default function ListingsPage() {
  const [items, setItems] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const session = getStoredSession();
    if (!session) return;
    const res = await api<{ items: Listing[] }>(
      `/v1/orgs/${session.organizationId}/listings`,
      { token: session.accessToken },
    );
    setItems(res.items);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function updateStatus(id: string, status: string) {
    const session = getStoredSession();
    if (!session) return;
    await api(`/v1/orgs/${session.organizationId}/listings/${id}`, {
      method: "PATCH",
      token: session.accessToken,
      body: JSON.stringify({ status }),
    });
    setMessage(`Listing marked ${status}.`);
    await load();
  }

  return (
    <DashboardShell>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <h1 className="display" style={{ fontSize: "2.4rem", margin: 0 }}>
            Listings
          </h1>
          <p style={{ color: "var(--ink-soft)", margin: "0.35rem 0 0" }}>
            Human-in-the-loop Marketplace workflow history. Publish only after you confirm in the browser.
          </p>
        </div>
        {message ? <p style={{ color: "var(--ok)", margin: 0 }}>{message}</p> : null}
        {error ? <p role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}
        <section className="panel" style={{ padding: "1rem", overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Salesperson</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.title}</strong>
                    <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                      {l.vehicle.stockNumber ?? l.vehicle.vin ?? "—"} · ${(l.priceCents / 100).toLocaleString()}
                    </div>
                  </td>
                  <td>{l.channel}</td>
                  <td>
                    <span className={`badge badge-${l.status}`}>{l.status}</span>
                  </td>
                  <td>{l.user.name}</td>
                  <td>{new Date(l.createdAt).toLocaleString()}</td>
                  <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    {l.status === "ready" ? (
                      <button className="btn btn-primary" type="button" style={{ padding: "0.35rem 0.55rem" }} onClick={() => updateStatus(l.id, "posted")}>
                        Mark posted
                      </button>
                    ) : null}
                    {l.status === "needs_removal" || l.status === "posted" ? (
                      <button className="btn btn-ghost" type="button" style={{ padding: "0.35rem 0.55rem" }} onClick={() => updateStatus(l.id, "removed")}>
                        Mark removed
                      </button>
                    ) : null}
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
