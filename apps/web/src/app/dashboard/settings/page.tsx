"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, getStoredSession } from "@/lib/api";
import { DashboardShell } from "@/components/DashboardShell";

export default function SettingsPage() {
  const [feedUrl, setFeedUrl] = useState("https://example.com/inventory.json");
  const [feedName, setFeedName] = useState("Primary inventory feed");
  const [audit, setAudit] = useState<Array<{ id: string; action: string; createdAt: string; actor: { name: string } | null }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = typeof window !== "undefined" ? getStoredSession() : null;

  useEffect(() => {
    const s = getStoredSession();
    if (!s) return;
    api<{ items: typeof audit }>(`/v1/orgs/${s.organizationId}/audit?take=20`, {
      token: s.accessToken,
    })
      .then((res) => setAudit(res.items))
      .catch((e) => setError(e.message));
  }, []);

  async function addFeed(e: FormEvent) {
    e.preventDefault();
    const s = getStoredSession();
    if (!s) return;
    try {
      await api(`/v1/orgs/${s.organizationId}/inventory-sources/feed`, {
        method: "POST",
        token: s.accessToken,
        body: JSON.stringify({ name: feedName, feedUrl, intervalMinutes: 60 }),
      });
      setMessage("Feed source saved. Worker will sync on schedule.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save feed");
    }
  }

  return (
    <DashboardShell>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <h1 className="display" style={{ fontSize: "2.4rem", margin: 0 }}>
            Settings
          </h1>
          <p style={{ color: "var(--ink-soft)", margin: "0.35rem 0 0" }}>
            Inventory feeds, extension setup, and audit trail.
          </p>
        </div>
        {message ? <p style={{ color: "var(--ok)", margin: 0 }}>{message}</p> : null}
        {error ? <p role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}

        <section className="panel" style={{ padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>Chrome extension</h2>
          <ol style={{ color: "var(--ink-soft)", paddingLeft: "1.2rem" }}>
            <li>Open Chrome → Extensions → Developer mode.</li>
            <li>Load unpacked from <code>apps/extension</code>.</li>
            <li>Sign in with the same OKauto credentials.</li>
            <li>On Facebook Marketplace create-listing, choose a vehicle and Fill form — then confirm Publish yourself.</li>
          </ol>
          <p style={{ marginBottom: 0 }}>
            Policy: OKauto never bypasses CAPTCHA, login walls, or rate limits.
          </p>
        </section>

        <form className="panel" onSubmit={addFeed} style={{ padding: "1rem", display: "grid", gap: "0.75rem", maxWidth: 640 }}>
          <h2 style={{ margin: 0 }}>Inventory feed URL</h2>
          <label className="field">
            <span>Name</span>
            <input value={feedName} onChange={(e) => setFeedName(e.target.value)} required />
          </label>
          <label className="field">
            <span>JSON feed URL</span>
            <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} required type="url" />
          </label>
          <button className="btn btn-primary" type="submit" style={{ justifySelf: "start" }}>
            Save feed
          </button>
        </form>

        <section className="panel" style={{ padding: "1rem", overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>Recent audit events</h2>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.createdAt).toLocaleString()}</td>
                  <td>{a.action}</td>
                  <td>{a.actor?.name ?? "system"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {session ? (
            <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
              Org ID: {session.organizationId}
            </p>
          ) : null}
        </section>
      </div>
    </DashboardShell>
  );
}
