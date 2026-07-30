"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { money, miles } from "@/lib/format";
import { StatusBadge } from "@/components/ui";

export interface InventoryRow {
  id: string;
  name: string;
  vin: string | null;
  stockNumber: string | null;
  mileage: number | null;
  priceCents: number | null;
  status: string;
  photo: string | null;
  descriptionReady: boolean;
  listedBy: string[];
}

export function InventoryTable({
  orgId,
  vehicles,
  isManager,
}: {
  orgId: string;
  vehicles: InventoryRow[];
  isManager: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === vehicles.length ? new Set() : new Set(vehicles.map((v) => v.id)),
    );
  }

  async function bulk(action: string) {
    if (selected.size === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ succeeded: number; failed: number }>(
        `/api/v1/orgs/${orgId}/vehicles/bulk`,
        { method: "POST", json: { action, vehicleIds: [...selected] } },
      );
      setMessage(
        result.failed > 0
          ? `${result.succeeded} succeeded, ${result.failed} failed`
          : `${result.succeeded} vehicle${result.succeeded === 1 ? "" : "s"} updated`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setMessage(err instanceof ClientApiError ? err.message : "Bulk action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {isManager && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-brand-50 px-5 py-3">
          <span className="text-sm font-medium text-brand-900">{selected.size} selected</span>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => bulk("generate_descriptions")}
          >
            Generate descriptions
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => bulk("mark_sold")}>
            Mark sold
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => bulk("mark_available")}>
            Mark available
          </button>
          <button className="btn-danger" disabled={busy} onClick={() => bulk("archive")}>
            Archive
          </button>
        </div>
      ) : null}
      {message ? (
        <p
          role="status"
          className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-sm text-slate-600"
        >
          {message}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              {isManager ? (
                <th className="px-5 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all vehicles"
                    checked={selected.size === vehicles.length && vehicles.length > 0}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              <th className="px-3 py-3">Vehicle</th>
              <th className="px-3 py-3">Stock #</th>
              <th className="px-3 py-3">Mileage</th>
              <th className="px-3 py-3">Price</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Listed by</th>
              <th className="px-3 py-3">
                <span className="sr-only">Description ready</span>Desc
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vehicles.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                {isManager ? (
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${v.name}`}
                      checked={selected.has(v.id)}
                      onChange={() => toggle(v.id)}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={v.photo ?? "https://placehold.co/96x64?text=No+photo"}
                      alt=""
                      className="h-10 w-14 rounded object-cover"
                      loading="lazy"
                    />
                    <div>
                      <Link
                        href={`/o/${orgId}/inventory/${v.id}`}
                        className="font-medium text-slate-900 hover:text-brand-600"
                      >
                        {v.name}
                      </Link>
                      <p className="text-xs text-slate-400">{v.vin ?? "No VIN"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-slate-600">{v.stockNumber ?? "—"}</td>
                <td className="px-3 py-3 text-slate-600">{miles(v.mileage)}</td>
                <td className="px-3 py-3 font-medium">{money(v.priceCents)}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={v.status} />
                </td>
                <td className="px-3 py-3 text-xs text-slate-500">
                  {v.listedBy.length > 0 ? v.listedBy.join(", ") : "—"}
                </td>
                <td
                  className="px-3 py-3"
                  aria-label={v.descriptionReady ? "Description ready" : "No description"}
                >
                  {v.descriptionReady ? "✅" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
