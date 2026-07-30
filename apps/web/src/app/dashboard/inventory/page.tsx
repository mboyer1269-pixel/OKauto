"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, ApiClientError, formatPrice } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import {
  Badge, Button, EmptyState, ErrorNote, Field, Modal, PageHeader, Spinner, TableShell, Td, Th, inputClass,
} from "@/components/ui";

interface VehicleRow {
  id: string;
  vin: string;
  stockNumber: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  priceCents: number | null;
  status: string;
  source: string;
  activeListingCount: number;
  updatedAt: string;
}

interface VehicleList {
  items: VehicleRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function InventoryPage() {
  const { currentOrg } = useSession();
  const orgId = currentOrg?.orgId;
  const canManage = currentOrg?.role === "OWNER" || currentOrg?.role === "MANAGER";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const path = useMemo(() => {
    if (!orgId) return null;
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    return `/api/v1/orgs/${orgId}/vehicles?${params}`;
  }, [orgId, q, status, page]);

  const { data, error, loading, reload } = useApi<VehicleList>(path);

  async function runBulk(action: string) {
    if (!orgId || selected.size === 0) return;
    setBulkBusy(true);
    setNotice(null);
    try {
      const res = await api<{ affected: number }>(`/api/v1/orgs/${orgId}/vehicles/bulk`, {
        method: "POST",
        body: { vehicleIds: [...selected], action },
      });
      setNotice(`${res.affected} vehicle(s) updated.`);
      setSelected(new Set());
      reload();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={data ? `${data.total} vehicles` : undefined}
        action={
          <div className="flex gap-2">
            {canManage && (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                Import CSV
              </Button>
            )}
            <Button onClick={() => setAddOpen(true)}>Add vehicle</Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search VIN, make, model, stock #…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          aria-label="Search inventory"
        />
        <select
          className={`${inputClass} w-auto`}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="PENDING">Pending</option>
          <option value="SOLD">Sold</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        {canManage && selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1">
            <span className="text-xs font-medium text-indigo-700">{selected.size} selected</span>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => runBulk("MARK_SOLD")}>Mark sold</Button>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => runBulk("MARK_AVAILABLE")}>Mark available</Button>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => runBulk("GENERATE_DESCRIPTIONS")}>Generate descriptions</Button>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => runBulk("ARCHIVE")}>Archive</Button>
          </div>
        )}
      </div>

      {notice && <p className="mb-2 text-sm text-indigo-700">{notice}</p>}
      <ErrorNote message={error} />
      {loading && <Spinner />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="No vehicles found"
          hint="Import your inventory from a CSV export or add vehicles manually to get started."
          action={canManage ? <Button onClick={() => setImportOpen(true)}>Import CSV</Button> : undefined}
        />
      )}

      {data && data.items.length > 0 && (
        <TableShell>
          <thead className="bg-slate-50">
            <tr>
              {canManage && (
                <Th>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={selected.size === data.items.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(data.items.map((v) => v.id)) : new Set())
                    }
                  />
                </Th>
              )}
              <Th>Vehicle</Th>
              <Th>VIN / Stock</Th>
              <Th>Mileage</Th>
              <Th>Price</Th>
              <Th>Status</Th>
              <Th>Listings</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                {canManage && (
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${v.year} ${v.make} ${v.model}`}
                      checked={selected.has(v.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(v.id);
                        else next.delete(v.id);
                        setSelected(next);
                      }}
                    />
                  </Td>
                )}
                <Td>
                  <Link href={`/dashboard/inventory/${v.id}`} className="font-medium text-indigo-700 hover:underline">
                    {v.year} {v.make} {v.model} {v.trim ?? ""}
                  </Link>
                </Td>
                <Td className="text-xs text-slate-500">
                  {v.vin}
                  {v.stockNumber ? ` · ${v.stockNumber}` : ""}
                </Td>
                <Td>{v.mileage !== null ? v.mileage.toLocaleString() : "—"}</Td>
                <Td>{formatPrice(v.priceCents)}</Td>
                <Td>
                  <Badge value={v.status} />
                </Td>
                <Td>{v.activeListingCount > 0 ? `${v.activeListingCount} live` : "—"}</Td>
                <Td className="text-xs text-slate-400">{v.source}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {data && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next →
          </Button>
        </div>
      )}

      {orgId && (
        <>
          <CsvImportModal orgId={orgId} open={importOpen} onClose={() => setImportOpen(false)} onImported={reload} />
          <AddVehicleModal orgId={orgId} open={addOpen} onClose={() => setAddOpen(false)} onAdded={reload} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CsvImportModal({
  orgId,
  open,
  onClose,
  onImported,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [markMissing, setMarkMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{
    stats: { total: number; created: number; updated: number; markedSold: number; skipped: number; priceChanges: number; errors: { row: number; vin?: string; messages: string[] }[] };
  } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await api<typeof report>(`/api/v1/orgs/${orgId}/imports/csv`, {
        method: "POST",
        body: { csv, markMissingAsSold: markMissing },
      });
      setReport(res);
      onImported();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import inventory from CSV" open={open} onClose={onClose} wide>
      <div className="space-y-4">
        <ErrorNote message={error} />
        <Field
          label="CSV file"
          hint="Headers are matched flexibly: VIN, Stock #, Year, Make, Model, Trim, Body, Miles, Price, Colors, Transmission, Fuel, Photos…"
        >
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
        </Field>
        <Field label="Or paste CSV">
          <textarea
            className={`${inputClass} h-32 font-mono text-xs`}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"VIN,Year,Make,Model,Price\n1HGCM82633A004352,2003,Honda,Accord,$8995"}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={markMissing} onChange={(e) => setMarkMissing(e.target.checked)} />
          Mark vehicles missing from this file as <strong>sold</strong> (full-inventory exports only)
        </label>
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || csv.trim().length === 0}>
            {busy ? "Importing…" : "Import"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        {report && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-medium text-slate-700">Import report</div>
            <ul className="mt-1 grid grid-cols-3 gap-1 text-xs text-slate-600">
              <li>Total rows: {report.stats.total}</li>
              <li>Created: {report.stats.created}</li>
              <li>Updated: {report.stats.updated}</li>
              <li>Price changes: {report.stats.priceChanges}</li>
              <li>Marked sold: {report.stats.markedSold}</li>
              <li>Skipped: {report.stats.skipped}</li>
            </ul>
            {report.stats.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-red-600">
                  {report.stats.errors.length} row error(s)
                </summary>
                <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-red-600">
                  {report.stats.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row} {e.vin ? `(${e.vin})` : ""}: {e.messages.join("; ")}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function AddVehicleModal({
  orgId,
  open,
  onClose,
  onAdded,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [vin, setVin] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [decodeNote, setDecodeNote] = useState<string | null>(null);
  const [form, setForm] = useState({ year: "", make: "", model: "", trim: "", mileage: "", price: "", stockNumber: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function decode() {
    setDecoding(true);
    setDecodeNote(null);
    try {
      const res = await api<{
        valid: boolean;
        error?: string;
        decoded?: { year?: number; make?: string; model?: string; trim?: string };
        offline: { manufacturer?: string; modelYear?: number };
      }>(`/api/v1/vin/decode`, { method: "POST", body: { vin } });
      if (!res.valid) {
        setDecodeNote(res.error ?? "VIN is invalid");
        return;
      }
      const d = res.decoded;
      setForm((f) => ({
        ...f,
        year: String(d?.year ?? res.offline.modelYear ?? f.year),
        make: d?.make ?? res.offline.manufacturer ?? f.make,
        model: d?.model ?? f.model,
        trim: d?.trim ?? f.trim,
      }));
      setDecodeNote(d ? "Decoded via NHTSA vPIC." : "VIN valid — filled what we could offline.");
    } catch {
      setDecodeNote("Decoding failed; enter details manually.");
    } finally {
      setDecoding(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/vehicles`, {
        method: "POST",
        body: {
          vin: vin.trim(),
          year: Number(form.year),
          make: form.make,
          model: form.model,
          trim: form.trim || undefined,
          stockNumber: form.stockNumber || undefined,
          mileage: form.mileage ? Number(form.mileage.replace(/[,\s]/g, "")) : undefined,
          priceCents: form.price ? Math.round(Number(form.price.replace(/[$,\s]/g, "")) * 100) : undefined,
        },
      });
      onAdded();
      onClose();
      setVin("");
      setForm({ year: "", make: "", model: "", trim: "", mileage: "", price: "", stockNumber: "" });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create vehicle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add a vehicle" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <Field label="VIN" hint={decodeNote ?? "17-character VIN; we validate the check digit and decode specs."}>
          <div className="flex gap-2">
            <input
              className={inputClass}
              required
              minLength={11}
              maxLength={17}
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
            />
            <Button variant="secondary" onClick={decode} disabled={decoding || vin.length < 11}>
              {decoding ? "…" : "Decode"}
            </Button>
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Year">
            <input className={inputClass} required type="number" value={form.year} onChange={(e) => set("year", e.target.value)} />
          </Field>
          <Field label="Make">
            <input className={inputClass} required value={form.make} onChange={(e) => set("make", e.target.value)} />
          </Field>
          <Field label="Model">
            <input className={inputClass} required value={form.model} onChange={(e) => set("model", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trim (optional)">
            <input className={inputClass} value={form.trim} onChange={(e) => set("trim", e.target.value)} />
          </Field>
          <Field label="Stock # (optional)">
            <input className={inputClass} value={form.stockNumber} onChange={(e) => set("stockNumber", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mileage">
            <input className={inputClass} value={form.mileage} onChange={(e) => set("mileage", e.target.value)} />
          </Field>
          <Field label="Price (USD)">
            <input className={inputClass} value={form.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add vehicle"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
