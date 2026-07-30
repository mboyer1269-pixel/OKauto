"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VEHICLE_STATUSES } from "@okauto/shared";
import { useAuth } from "@/lib/auth";
import type { Paginated } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { formatMoney, formatNumber, humanize, statusColor, vehicleName } from "@/lib/format";

interface VehicleRow {
  id: string;
  vin: string | null;
  stockNumber: string | null;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  priceCents: number;
  status: string;
  photos: { url: string }[];
  listings: { id: string; status: string; channel: string }[];
}

interface CsvResult {
  stats: { created: number; updated: number; unchanged: number; failed: number; errors: { index: number; message: string }[] };
}

export default function InventoryPage() {
  const { api, activeRole } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<Paginated<VehicleRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvResult, setCsvResult] = useState<CsvResult | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const canBulk = activeRole === "ORG_OWNER" || activeRole === "ORG_MANAGER";

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (status) params.set("status", status);
        params.set("limit", "25");
        if (cursor) params.set("cursor", cursor);
        const result = await api<Paginated<VehicleRow>>(`/vehicles?${params}`);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load inventory");
      } finally {
        setLoading(false);
      }
    },
    [api, q, status],
  );

  useEffect(() => {
    setCursorStack([]);
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const toggleAll = () => {
    if (!data) return;
    setSelected((prev) => (prev.size === data.items.length ? new Set() : new Set(data.items.map((v) => v.id))));
  };

  const bulk = async (action: string) => {
    const vehicleIds = [...selected];
    if (vehicleIds.length === 0) return;
    setBulkResult(null);
    try {
      const res = await api<{ succeeded: number; failed: number }>("/vehicles/bulk", {
        method: "POST",
        body: { action, vehicleIds },
      });
      setBulkResult(`${humanize(action)}: ${res.succeeded} succeeded, ${res.failed} failed`);
      setSelected(new Set());
      await load();
    } catch (err) {
      setBulkResult(err instanceof Error ? err.message : "Bulk action failed");
    }
  };

  const uploadCsv = async () => {
    setCsvResult(null);
    try {
      const res = await api<CsvResult>("/imports/csv", { method: "POST", body: { csv: csvText } });
      setCsvResult(res);
      await load();
    } catch (err) {
      setCsvResult({ stats: { created: 0, updated: 0, unchanged: 0, failed: -1, errors: [{ index: -1, message: err instanceof Error ? err.message : "Import failed" }] } });
    }
  };

  const hasSelection = selected.size > 0;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Vehicles synced from your sources, ready to list"
        actions={
          <>
            {canBulk ? (
              <Button variant="secondary" onClick={() => setCsvOpen(true)}>
                Import CSV
              </Button>
            ) : null}
            <AddVehicleButton onCreated={() => void load()} />
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-xs"
            placeholder="Search make, model, VIN, stock #…"
            aria-label="Search inventory"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {VEHICLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {hasSelection && canBulk ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-700/50 bg-brand-900/20 p-3" role="toolbar" aria-label="Bulk actions">
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <Button size="sm" onClick={() => void bulk("queue-listings")}>Queue listings</Button>
          <Button size="sm" variant="secondary" onClick={() => void bulk("generate-descriptions")}>Generate descriptions</Button>
          <Button size="sm" variant="secondary" onClick={() => void bulk("mark-sold")}>Mark sold</Button>
          <Button size="sm" variant="danger" onClick={() => void bulk("archive")}>Archive</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}
      {bulkResult ? <p className="mb-3 text-sm text-brand-300" role="status">{bulkResult}</p> : null}

      {loading ? (
        <Spinner />
      ) : error ? (
        <p role="alert" className="text-sm text-red-300">{error}</p>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No vehicles yet"
          hint="Import a CSV, connect a JSON feed in Settings, or add a vehicle manually."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink-700/60 text-left text-xs uppercase text-ink-400">
                {canBulk ? (
                  <th className="p-3">
                    <input
                      type="checkbox"
                      aria-label="Select all vehicles"
                      checked={selected.size === data.items.length && data.items.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                ) : null}
                <th className="p-3">Vehicle</th>
                <th className="p-3">Stock / VIN</th>
                <th className="p-3">Mileage</th>
                <th className="p-3">Price</th>
                <th className="p-3">Status</th>
                <th className="p-3">Listing</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((v) => (
                <tr key={v.id} className="border-b border-ink-700/40 last:border-0 hover:bg-ink-700/20">
                  {canBulk ? (
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${vehicleName(v)}`}
                        checked={selected.has(v.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(v.id)) next.delete(v.id);
                            else next.add(v.id);
                            return next;
                          })
                        }
                      />
                    </td>
                  ) : null}
                  <td className="p-3">
                    <Link href={`/inventory/${v.id}`} className="font-semibold text-ink-200 hover:text-brand-300">
                      {vehicleName(v)}
                    </Link>
                  </td>
                  <td className="p-3 font-mono text-xs text-ink-400">{v.stockNumber ?? v.vin ?? "—"}</td>
                  <td className="p-3">{formatNumber(v.mileage)}</td>
                  <td className="p-3 font-semibold">{formatMoney(v.priceCents)}</td>
                  <td className="p-3">
                    <Badge colorClass={statusColor(v.status)}>{humanize(v.status)}</Badge>
                  </td>
                  <td className="p-3">
                    {v.listings[0] ? (
                      <Badge colorClass={statusColor(v.listings[0].status)}>{humanize(v.listings[0].status)}</Badge>
                    ) : (
                      <span className="text-xs text-ink-600">not listed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={cursorStack.length === 0}
          onClick={() => {
            const stack = [...cursorStack];
            stack.pop();
            const prev = stack[stack.length - 1];
            setCursorStack(stack);
            void load(prev);
          }}
        >
          ← Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!data?.nextCursor}
          onClick={() => {
            if (!data?.nextCursor) return;
            setCursorStack((s) => [...s, data.nextCursor!]);
            void load(data.nextCursor);
          }}
        >
          Next →
        </Button>
      </div>

      <Modal open={csvOpen} onClose={() => { setCsvOpen(false); setCsvResult(null); }} title="Import CSV">
        <p className="mb-3 text-xs text-ink-400">
          Paste CSV with headers like <code className="font-mono text-brand-300">vin,stocknumber,year,make,model,price,mileage,photos</code>.
          Imports are deduplicated by VIN or stock number, so re-importing is safe. Each import is a full snapshot —
          vehicles that disappear trigger sold detection.
        </p>
        <textarea
          className="h-40 w-full rounded-lg border border-ink-600 bg-ink-900 p-3 font-mono text-xs text-ink-200"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          aria-label="CSV content"
        />
        {csvResult ? (
          <div className="mt-3 rounded-lg bg-ink-900 p-3 text-xs" role="status">
            <p>
              created={csvResult.stats.created} updated={csvResult.stats.updated} unchanged={csvResult.stats.unchanged}{" "}
              failed={csvResult.stats.failed}
            </p>
            {csvResult.stats.errors.slice(0, 5).map((e, i) => (
              <p key={i} className="mt-1 text-red-300">
                row {e.index + 1}: {e.message}
              </p>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setCsvOpen(false); setCsvResult(null); }}>Close</Button>
          <Button onClick={() => void uploadCsv()} disabled={!csvText.trim()}>Import</Button>
        </div>
      </Modal>
    </div>
  );
}

function AddVehicleButton({ onCreated }: { onCreated: () => void }) {
  const { api } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ vin: "", stockNumber: "", year: "", make: "", model: "", trim: "", mileage: "", price: "" });

  const canSubmit = form.make.trim() && form.model.trim() && form.price.trim() && (form.vin.trim() || form.stockNumber.trim());

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/vehicles", {
        method: "POST",
        body: {
          vin: form.vin || null,
          stockNumber: form.stockNumber || null,
          year: form.year ? Number(form.year) : null,
          make: form.make,
          model: form.model,
          trim: form.trim || null,
          mileage: form.mileage ? Number(form.mileage.replace(/,/g, "")) : null,
          priceCents: Math.round(Number(form.price.replace(/[$,]/g, "")) * 100),
        },
      });
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create vehicle");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add vehicle</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add vehicle manually">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="VIN (optional)" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
          <Input placeholder="Stock #" value={form.stockNumber} onChange={(e) => setForm({ ...form, stockNumber: e.target.value })} />
          <Input placeholder="Year" inputMode="numeric" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          <Input placeholder="Make *" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
          <Input placeholder="Model *" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <Input placeholder="Trim" value={form.trim} onChange={(e) => setForm({ ...form, trim: e.target.value })} />
          <Input placeholder="Mileage" inputMode="numeric" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
          <Input placeholder="Price (USD) *" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <p className="mt-2 text-xs text-ink-400">A valid VIN auto-fills the year and validates the check digit. VIN or stock # is required for dedupe.</p>
        {error ? <p role="alert" className="mt-2 text-sm text-red-300">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit || busy}>{busy ? "Saving…" : "Save vehicle"}</Button>
        </div>
      </Modal>
    </>
  );
}
