"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

interface ImportStats {
  total: number;
  created: number;
  updated: number;
  priceChanges: number;
  markedMissing: number;
  markedSold: number;
  errors: Array<{ row: number; message: string }>;
}

export default function ImportPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStats(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/v1/orgs/${orgId}/vehicles/import`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok && !data.stats) {
        throw new Error(data.error?.message ?? "Import failed");
      }
      setStats(data.stats);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Import inventory from CSV</h1>
      <div className="card space-y-5 p-6">
        <p className="text-sm text-slate-600">
          Upload a CSV export from your DMS or website. Recognized columns:{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">
            VIN, Stock, Year, Make, Model, Trim, Body, Mileage, Price, Condition, Description, Photos
          </code>{" "}
          (photos separated by <code className="rounded bg-slate-100 px-1 text-xs">|</code>). Rows
          are de-duplicated by VIN, then stock number. Re-uploading the same file is safe.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div>
            <label className="label" htmlFor="file">
              CSV file
            </label>
            <input className="input" id="file" name="file" type="file" accept=".csv,text/csv" required />
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Importing…" : "Import"}
          </button>
        </form>

        {stats ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" role="status">
            <p className="text-sm font-semibold text-slate-800">Import complete</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-3">
              <div className="flex justify-between sm:block">
                <dt>Rows</dt>
                <dd className="font-semibold">{stats.total}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt>Created</dt>
                <dd className="font-semibold text-emerald-700">{stats.created}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt>Updated</dt>
                <dd className="font-semibold">{stats.updated}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt>Price changes</dt>
                <dd className="font-semibold">{stats.priceChanges}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt>Marked sold</dt>
                <dd className="font-semibold">{stats.markedSold}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt>Row issues</dt>
                <dd className="font-semibold text-amber-700">{stats.errors.length}</dd>
              </div>
            </dl>
            {stats.errors.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-amber-700">
                  View row issues ({stats.errors.length})
                </summary>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {stats.errors.slice(0, 100).map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <Link className="btn-secondary mt-4" href={`/o/${orgId}/inventory`}>
              Go to inventory
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
