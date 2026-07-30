"use client";

import { useState } from "react";
import { api, ApiClientError, formatDate } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import {
  Badge, Button, Card, EmptyState, ErrorNote, Field, Modal, PageHeader, Spinner, TableShell, Td, Th, inputClass,
} from "@/components/ui";

interface Feed {
  id: string;
  name: string;
  type: string;
  url: string;
  intervalMinutes: number;
  markMissingAsSold: boolean;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
}

interface SyncRun {
  id: string;
  trigger: string;
  status: string;
  stats: {
    total?: number;
    created?: number;
    updated?: number;
    unchanged?: number;
    markedSold?: number;
    priceChanges?: number;
    skipped?: number;
    errors?: { row: number; vin?: string; messages: string[] }[];
  };
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export default function SyncPage() {
  const { currentOrg } = useSession();
  const orgId = currentOrg?.orgId;
  const feeds = useApi<{ feeds: Feed[] }>(orgId ? `/api/v1/orgs/${orgId}/feeds` : null);
  const runs = useApi<{ runs: SyncRun[] }>(orgId ? `/api/v1/orgs/${orgId}/sync-runs` : null);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function syncNow(feedId: string) {
    if (!orgId) return;
    setNotice(null);
    try {
      const res = await api<{ queued: boolean }>(`/api/v1/orgs/${orgId}/feeds/${feedId}/sync`, {
        method: "POST",
        body: {},
      });
      setNotice(res.queued ? "Sync queued — refresh in a few seconds." : "A sync for this feed is already queued.");
      setTimeout(() => {
        feeds.reload();
        runs.reload();
      }, 3000);
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Could not queue sync");
    }
  }

  async function toggleFeed(feed: Feed) {
    if (!orgId) return;
    try {
      await api(`/api/v1/orgs/${orgId}/feeds/${feed.id}`, { method: "PATCH", body: { active: !feed.active } });
      feeds.reload();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Update failed");
    }
  }

  async function deleteFeed(feedId: string) {
    if (!orgId || !confirm("Delete this feed? Existing vehicles are kept.")) return;
    try {
      await api(`/api/v1/orgs/${orgId}/feeds/${feedId}`, { method: "DELETE" });
      feeds.reload();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Sync health"
        subtitle="Inventory feeds, schedules, and recent sync runs with per-row error reporting."
        action={<Button onClick={() => setAddOpen(true)}>Add feed</Button>}
      />
      {notice && <p className="mb-3 text-sm text-indigo-700">{notice}</p>}

      <Card title="Feeds" className="mb-4">
        <ErrorNote message={feeds.error} />
        {feeds.loading && <Spinner />}
        {feeds.data && feeds.data.feeds.length === 0 && (
          <EmptyState
            title="No feeds configured"
            hint="Connect your website or DMS export (CSV or JSON URL) and OpenLot keeps inventory in sync automatically, detecting sold vehicles and price changes."
          />
        )}
        {feeds.data && feeds.data.feeds.length > 0 && (
          <TableShell>
            <thead className="bg-slate-50">
              <tr>
                <Th>Feed</Th>
                <Th>Type</Th>
                <Th>Interval</Th>
                <Th>Sold detection</Th>
                <Th>Last run</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {feeds.data.feeds.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="font-medium text-slate-800">{f.name}</div>
                    <div className="max-w-[280px] truncate text-xs text-slate-400" title={f.url}>
                      {f.url}
                    </div>
                  </Td>
                  <Td>{f.type === "CSV_URL" ? "CSV" : "JSON"}</Td>
                  <Td>{f.intervalMinutes > 0 ? `${f.intervalMinutes} min` : "manual"}</Td>
                  <Td>{f.markMissingAsSold ? "on" : "off"}</Td>
                  <Td className="text-xs">{formatDate(f.lastRunAt)}</Td>
                  <Td>{f.lastStatus ? <Badge value={f.lastStatus} /> : "—"}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button variant="ghost" onClick={() => syncNow(f.id)}>Sync now</Button>
                      <Button variant="ghost" onClick={() => toggleFeed(f)}>{f.active ? "Pause" : "Resume"}</Button>
                      <Button variant="ghost" onClick={() => deleteFeed(f.id)}>Delete</Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card title="Recent sync runs" action={<Button variant="ghost" onClick={() => runs.reload()}>Refresh</Button>}>
        <ErrorNote message={runs.error} />
        {runs.loading && <Spinner />}
        {runs.data && runs.data.runs.length === 0 && <p className="text-sm text-slate-400">No sync runs yet.</p>}
        {runs.data && runs.data.runs.length > 0 && (
          <div className="space-y-2">
            {runs.data.runs.map((r) => (
              <details key={r.id} className="rounded-lg border border-slate-200 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm">
                  <Badge value={r.status} />
                  <span className="text-slate-600">{formatDate(r.startedAt)}</span>
                  <span className="text-xs text-slate-400">trigger: {r.trigger}</span>
                  <span className="text-xs text-slate-500">
                    {r.stats.total ?? 0} rows · {r.stats.created ?? 0} new · {r.stats.updated ?? 0} updated ·{" "}
                    {r.stats.markedSold ?? 0} sold · {r.stats.priceChanges ?? 0} price changes
                  </span>
                </summary>
                <div className="mt-2 text-xs text-slate-600">
                  {r.error && <p className="mb-1 text-red-600">Error: {r.error}</p>}
                  {(r.stats.errors?.length ?? 0) > 0 ? (
                    <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                      {r.stats.errors!.map((e, i) => (
                        <li key={i} className="text-red-600">
                          Row {e.row} {e.vin ? `(${e.vin})` : ""}: {e.messages.join("; ")}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    !r.error && <p className="text-slate-400">No row errors.</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>

      {orgId && <AddFeedModal orgId={orgId} open={addOpen} onClose={() => setAddOpen(false)} onAdded={() => feeds.reload()} />}
    </div>
  );
}

function AddFeedModal({
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
  const [name, setName] = useState("");
  const [type, setType] = useState("CSV_URL");
  const [url, setUrl] = useState("");
  const [interval, setInterval] = useState("60");
  const [markMissing, setMarkMissing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/feeds`, {
        method: "POST",
        body: { name, type, url, intervalMinutes: Number(interval), markMissingAsSold: markMissing },
      });
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create feed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add an inventory feed" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <Field label="Name">
          <input className={inputClass} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Website inventory export" />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="CSV_URL">CSV URL</option>
            <option value="JSON_URL">JSON URL</option>
          </select>
        </Field>
        <Field label="URL">
          <input className={inputClass} required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourdealership.com/inventory.csv" />
        </Field>
        <Field label="Sync interval (minutes)" hint="0 = manual only">
          <input className={inputClass} type="number" min={0} max={1440} value={interval} onChange={(e) => setInterval(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={markMissing} onChange={(e) => setMarkMissing(e.target.checked)} />
          Mark vehicles missing from the feed as sold (recommended for full-inventory feeds)
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add feed"}
        </Button>
      </form>
    </Modal>
  );
}
