"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, getStoredSession } from "@/lib/api";
import { DashboardShell } from "@/components/DashboardShell";

type Vehicle = {
  id: string;
  vin: string | null;
  stockNumber: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  priceCents: number;
  mileage: number | null;
  status: string;
  description: string | null;
  photoUrls: string[];
};

export default function InventoryPage() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [csv, setCsv] = useState(
    "vin,stockNumber,year,make,model,trim,price,mileage,exteriorColor,photoUrls\n1FTFW1E50MKB00001,B2001,2021,Ford,Bronco,Big Bend,38990,12000,Gray,https://images.unsplash.com/photo-1605893477799-b4c4c8610fad?w=1200",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const session = getStoredSession();
    if (!session) return;
    const res = await api<{ items: Vehicle[] }>(
      `/v1/orgs/${session.organizationId}/vehicles?search=${encodeURIComponent(search)}`,
      { token: session.accessToken },
    );
    setItems(res.items);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importCsv(e: FormEvent) {
    e.preventDefault();
    const session = getStoredSession();
    if (!session) return;
    setMessage(null);
    setError(null);
    try {
      const res = await api<{ result: { created: number; updated: number; skipped: number } }>(
        `/v1/orgs/${session.organizationId}/vehicles/import`,
        {
          method: "POST",
          token: session.accessToken,
          body: JSON.stringify({ csv }),
        },
      );
      setMessage(
        `Import complete: ${res.result.created} created, ${res.result.updated} updated, ${res.result.skipped} skipped.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function describe(vehicleId: string) {
    const session = getStoredSession();
    if (!session) return;
    await api(`/v1/orgs/${session.organizationId}/vehicles/${vehicleId}/describe`, {
      method: "POST",
      token: session.accessToken,
      body: JSON.stringify({ tone: "professional" }),
    });
    setMessage("Description generated.");
    await load();
  }

  async function createListing(vehicleId: string) {
    const session = getStoredSession();
    if (!session) return;
    await api(`/v1/orgs/${session.organizationId}/listings`, {
      method: "POST",
      token: session.accessToken,
      body: JSON.stringify({ vehicleId, channel: "marketplace" }),
    });
    setMessage("Listing draft created — open Listings or the Chrome extension to post.");
  }

  async function bulk(action: "archive" | "mark_available" | "mark_sold") {
    const session = getStoredSession();
    if (!session || selected.length === 0) return;
    await api(`/v1/orgs/${session.organizationId}/vehicles/bulk`, {
      method: "POST",
      token: session.accessToken,
      body: JSON.stringify({ vehicleIds: selected, action }),
    });
    setSelected([]);
    setMessage(`Bulk ${action} applied.`);
    await load();
  }

  return (
    <DashboardShell>
      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 className="display" style={{ fontSize: "2.4rem", margin: 0 }}>
              Inventory
            </h1>
            <p style={{ color: "var(--ink-soft)", margin: "0.35rem 0 0" }}>
              Import, normalize, and prepare vehicles for Marketplace.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load().catch((err) => setError(err.message));
            }}
            style={{ display: "flex", gap: "0.5rem" }}
          >
            <input
              aria-label="Search inventory"
              placeholder="Search VIN, stock, make…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ border: "1px solid var(--line)", padding: "0.65rem 0.8rem", minWidth: 220 }}
            />
            <button className="btn btn-ghost" type="submit">
              Search
            </button>
          </form>
        </div>

        {message ? <p style={{ color: "var(--ok)", margin: 0 }}>{message}</p> : null}
        {error ? <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}

        <section className="panel" style={{ padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>CSV import</h2>
          <form onSubmit={importCsv} style={{ display: "grid", gap: "0.75rem" }}>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={4}
              aria-label="CSV inventory"
              style={{ width: "100%", border: "1px solid var(--line)", padding: "0.75rem", fontFamily: "ui-monospace, monospace" }}
            />
            <button className="btn btn-primary" type="submit" style={{ justifySelf: "start" }}>
              Import CSV
            </button>
          </form>
        </section>

        <section className="panel" style={{ padding: "1rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <button className="btn btn-ghost" type="button" onClick={() => bulk("mark_available")} disabled={!selected.length}>
              Mark available
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => bulk("mark_sold")} disabled={!selected.length}>
              Mark sold
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => bulk("archive")} disabled={!selected.length}>
              Archive
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">Select</span>
                  </th>
                  <th>Vehicle</th>
                  <th>Stock</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(v.id)}
                        aria-label={`Select ${v.year} ${v.make} ${v.model}`}
                        onChange={(e) => {
                          setSelected((prev) =>
                            e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id),
                          );
                        }}
                      />
                    </td>
                    <td>
                      <strong>
                        {v.year} {v.make} {v.model} {v.trim ?? ""}
                      </strong>
                      <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                        {v.vin ?? "No VIN"} · {v.mileage?.toLocaleString() ?? "—"} mi
                      </div>
                    </td>
                    <td>{v.stockNumber ?? "—"}</td>
                    <td>${(v.priceCents / 100).toLocaleString()}</td>
                    <td>
                      <span className={`badge badge-${v.status}`}>{v.status}</span>
                    </td>
                    <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      <button className="btn btn-ghost" type="button" style={{ padding: "0.35rem 0.55rem" }} onClick={() => describe(v.id)}>
                        AI describe
                      </button>
                      <button className="btn btn-primary" type="button" style={{ padding: "0.35rem 0.55rem" }} onClick={() => createListing(v.id)}>
                        Prepare listing
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
