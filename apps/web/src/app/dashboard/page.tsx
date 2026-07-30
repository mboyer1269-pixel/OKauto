"use client";

import { useEffect, useState } from "react";
import { api, getStoredSession } from "@/lib/api";
import { DashboardShell } from "@/components/DashboardShell";

type Summary = {
  vehiclesByStatus: Record<string, number>;
  listingsByStatus: Record<string, number>;
  listingsBySalesperson: Array<{
    userId: string;
    count: number;
    user: { name: string; email: string } | null;
  }>;
  syncHealth: Array<{
    id: string;
    name: string;
    health: string;
    lastSyncAt: string | null;
    lastError: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    createdAt: string;
    listing: { title: string; user: { name: string } };
  }>;
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="panel" style={{ padding: "1rem 1.1rem" }}>
      <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}>
        {label}
      </div>
      <div className="display" style={{ fontSize: "2.4rem", marginTop: "0.25rem" }}>
        {value}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session) return;
    api<Summary>(`/v1/orgs/${session.organizationId}/analytics/summary`, {
      token: session.accessToken,
    })
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <DashboardShell>
      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div>
          <h1 className="display" style={{ fontSize: "2.6rem", margin: 0 }}>
            Overview
          </h1>
          <p style={{ color: "var(--ink-soft)", margin: "0.4rem 0 0" }}>
            Real-time inventory and listing activity for your dealership.
          </p>
        </div>

        {error ? <p role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}

        {summary ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.85rem" }}>
              <Stat label="Available" value={summary.vehiclesByStatus.available ?? 0} />
              <Stat label="Listed" value={summary.vehiclesByStatus.listed ?? 0} />
              <Stat label="Sold" value={summary.vehiclesByStatus.sold ?? 0} />
              <Stat label="Posted listings" value={summary.listingsByStatus.posted ?? 0} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1rem",
              }}
            >
              <section className="panel" style={{ padding: "1rem" }}>
                <h2 style={{ marginTop: 0 }}>Listings by salesperson</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Listings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.listingsBySalesperson.length === 0 ? (
                      <tr>
                        <td colSpan={2}>No listing activity yet.</td>
                      </tr>
                    ) : (
                      summary.listingsBySalesperson.map((row) => (
                        <tr key={row.userId}>
                          <td>{row.user?.name ?? row.userId}</td>
                          <td>{row.count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>

              <section className="panel" style={{ padding: "1rem" }}>
                <h2 style={{ marginTop: 0 }}>Sync health</h2>
                {summary.syncHealth.length === 0 ? (
                  <p style={{ color: "var(--ink-soft)" }}>No inventory sources configured.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
                    {summary.syncHealth.map((s) => (
                      <li key={s.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: "0.6rem" }}>
                        <strong>{s.name}</strong>{" "}
                        <span className={`badge badge-${s.health === "healthy" ? "available" : "sold"}`}>
                          {s.health}
                        </span>
                        <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                          Last sync: {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : "never"}
                        </div>
                        {s.lastError ? (
                          <div style={{ fontSize: "0.85rem", color: "var(--danger)" }}>{s.lastError}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="panel" style={{ padding: "1rem" }}>
              <h2 style={{ marginTop: 0 }}>Recent activity</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>Listing</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentActivity.map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.createdAt).toLocaleString()}</td>
                      <td>
                        <span className="badge">{a.type}</span>
                      </td>
                      <td>{a.listing.title}</td>
                      <td>{a.listing.user.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : (
          <p>Loading analytics…</p>
        )}
      </div>
    </DashboardShell>
  );
}
