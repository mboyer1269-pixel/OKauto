"use client";

import { useState } from "react";
import { api, formatDate } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Badge, Button, EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/ui";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  meta: { vehicleId?: string; listingId?: string };
}

export default function NotificationsPage() {
  const { user } = useSession();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const path = user ? `/api/v1/notifications?pageSize=50${unreadOnly ? "&unreadOnly=true" : ""}` : null;
  const { data, error, loading, reload } = useApi<{ items: Notification[]; total: number }>(path);

  async function markRead(id: string) {
    await api(`/api/v1/notifications/${id}/read`, { method: "POST", body: {} });
    reload();
  }

  async function markAllRead() {
    await api("/api/v1/notifications/read-all", { method: "POST", body: {} });
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Sold-vehicle alerts, price changes, sync issues and reminders."
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only
            </label>
            <Button variant="secondary" onClick={markAllRead}>
              Mark all read
            </Button>
          </div>
        }
      />
      <ErrorNote message={error} />
      {loading && <Spinner />}
      {data && data.items.length === 0 && (
        <EmptyState title="You're all caught up" hint="Alerts appear here when vehicles sell, prices change, or syncs fail." />
      )}
      {data && data.items.length > 0 && (
        <ul className="space-y-2">
          {data.items.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border p-4 shadow-sm ${n.readAt ? "border-slate-200 bg-white" : "border-indigo-200 bg-indigo-50/50"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    {!n.readAt && <span className="h-2 w-2 rounded-full bg-indigo-500" aria-label="Unread" />}
                    <span className="text-sm font-semibold text-slate-800">{n.title}</span>
                    <Badge value={n.type} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDate(n.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {n.meta.vehicleId && (
                    <a href={`/dashboard/inventory/${n.meta.vehicleId}`} className="text-xs font-medium text-indigo-600 hover:underline">
                      View vehicle
                    </a>
                  )}
                  {!n.readAt && (
                    <Button variant="ghost" onClick={() => markRead(n.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
