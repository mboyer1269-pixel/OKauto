"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui";
import { dateTime, timeAgo } from "@/lib/format";

interface RunRow {
  id: string;
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  stats: Record<string, unknown>;
  error: string | null;
}

interface SourceRow {
  id: string;
  name: string;
  type: string;
  url: string | null;
  status: string;
  scheduleMinutes: number;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  vehicleCount: number;
  recentRuns: RunRow[];
}

export function SourcesManager({ orgId, sources }: { orgId: string; sources: SourceRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function syncNow(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const data = await api<{ status: string; stats: { created: number; updated: number; markedSold: number } }>(
        `/api/v1/orgs/${orgId}/sources/${id}/sync`,
        { method: "POST", json: {} },
      );
      setNotice(
        `Sync ${data.status.toLowerCase()}: ${data.stats.created} created, ${data.stats.updated} updated, ${data.stats.markedSold} marked sold.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Sync failed");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function togglePause(source: SourceRow) {
    setBusyId(source.id);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/sources/${source.id}`, {
        method: "PATCH",
        json: { status: source.status === "PAUSED" ? "ACTIVE" : "PAUSED" },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(source: SourceRow) {
    if (!window.confirm(`Delete source "${source.name}"? Vehicles stay in inventory.`)) return;
    setBusyId(source.id);
    try {
      await api(`/api/v1/orgs/${orgId}/sources/${source.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function createSource(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/sources`, {
        method: "POST",
        json: {
          name: form.get("name"),
          type: form.get("type"),
          url: form.get("url"),
          scheduleMinutes: Number(form.get("scheduleMinutes")),
        },
      });
      setShowForm(false);
      setNotice("Source created. The worker will sync it within a minute, or use Sync now.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not create the source");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Sync health</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Close" : "Add feed source"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}

      {showForm ? (
        <Card>
          <CardHeader title="New feed source" subtitle="Poll a JSON or CSV inventory feed on a schedule" />
          <form onSubmit={createSource} className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="src-name">
                Name
              </label>
              <input className="input" id="src-name" name="name" required placeholder="DMS feed" />
            </div>
            <div>
              <label className="label" htmlFor="src-type">
                Type
              </label>
              <select className="input" id="src-type" name="type" defaultValue="FEED_CSV">
                <option value="FEED_CSV">CSV feed</option>
                <option value="FEED_JSON">JSON feed</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="src-url">
                Feed URL
              </label>
              <input className="input" id="src-url" name="url" type="url" required placeholder="https://…" />
            </div>
            <div>
              <label className="label" htmlFor="src-schedule">
                Sync every (minutes)
              </label>
              <input
                className="input"
                id="src-schedule"
                name="scheduleMinutes"
                type="number"
                min={15}
                max={1440}
                defaultValue={60}
              />
            </div>
            <div className="flex items-end justify-end">
              <button className="btn-primary">Create source</button>
            </div>
          </form>
        </Card>
      ) : null}

      {sources.length === 0 && !showForm ? (
        <Card>
          <EmptyState
            title="No inventory sources yet"
            body="Add a feed URL to sync inventory automatically, or import a CSV from the Inventory page."
          />
        </Card>
      ) : null}

      {sources.map((source) => (
        <Card key={source.id}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                {source.name} <StatusBadge status={source.status} />
              </span>
            }
            subtitle={
              <>
                {source.type.replaceAll("_", " ").toLowerCase()} · {source.vehicleCount} vehicles ·{" "}
                {source.lastSyncAt ? `last sync ${timeAgo(source.lastSyncAt)}` : "never synced"}
                {source.url ? ` · ${source.url}` : ""}
              </>
            }
            action={
              <div className="flex gap-2">
                {source.url ? (
                  <button
                    className="btn-primary"
                    onClick={() => syncNow(source.id)}
                    disabled={busyId === source.id}
                  >
                    {busyId === source.id ? "Syncing…" : "Sync now"}
                  </button>
                ) : null}
                {source.type !== "CSV_UPLOAD" && source.type !== "MANUAL" ? (
                  <button className="btn-secondary" onClick={() => togglePause(source)} disabled={busyId === source.id}>
                    {source.status === "PAUSED" ? "Resume" : "Pause"}
                  </button>
                ) : null}
                <button className="btn-secondary" onClick={() => remove(source)} disabled={busyId === source.id}>
                  Delete
                </button>
              </div>
            }
          />
          {source.lastError ? (
            <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-2.5 text-sm text-red-700">
              Last error: {source.lastError}
            </p>
          ) : null}
          {source.recentRuns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">Run</th>
                    <th className="px-3 py-2.5">Trigger</th>
                    <th className="px-3 py-2.5">Created</th>
                    <th className="px-3 py-2.5">Updated</th>
                    <th className="px-3 py-2.5">Sold</th>
                    <th className="px-3 py-2.5">Issues</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {source.recentRuns.map((run) => {
                    const stats = run.stats as Partial<{
                      created: number;
                      updated: number;
                      markedSold: number;
                      errors: unknown[];
                    }>;
                    return (
                      <tr key={run.id}>
                        <td className="px-5 py-2.5 text-slate-600">{dateTime(run.startedAt)}</td>
                        <td className="px-3 py-2.5 text-slate-500">{run.trigger}</td>
                        <td className="px-3 py-2.5">{stats.created ?? 0}</td>
                        <td className="px-3 py-2.5">{stats.updated ?? 0}</td>
                        <td className="px-3 py-2.5">{stats.markedSold ?? 0}</td>
                        <td className="px-3 py-2.5">{Array.isArray(stats.errors) ? stats.errors.length : 0}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={run.status} />
                          {run.error ? <p className="mt-0.5 text-xs text-red-600">{run.error}</p> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-500">No sync runs yet.</p>
          )}
        </Card>
      ))}
    </div>
  );
}
