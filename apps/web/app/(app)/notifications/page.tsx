"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type { Paginated } from "@/lib/api";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { timeAgo } from "@/lib/format";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { vehicleId?: string; listingId?: string } | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const { api } = useAuth();
  const [data, setData] = useState<(Paginated<NotificationRow> & { unreadCount: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/notifications?unreadOnly=${unreadOnly}&limit=50`));
    } finally {
      setLoading(false);
    }
  }, [api, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    await api(`/notifications/${id}/read`, { method: "POST", body: {} });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={data ? `${data.unreadCount} unread` : undefined}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-ink-400">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only
            </label>
            <Button variant="secondary" size="sm" onClick={() => void api("/notifications/read-all", { method: "POST", body: {} }).then(load)}>
              Mark all read
            </Button>
          </>
        }
      />

      {loading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="All caught up" hint="Sold alerts, price changes, and listing issues will appear here in realtime." />
      ) : (
        <div className="grid gap-2">
          {data.items.map((n) => (
            <Card key={n.id} className={`flex items-start justify-between gap-3 p-4 ${n.readAt ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {!n.readAt ? <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-400 align-middle" aria-label="unread" /> : null}
                  {n.title}
                </p>
                <p className="mt-1 text-sm text-ink-400">{n.body}</p>
                <p className="mt-1 text-xs text-ink-600">
                  {n.type} • {timeAgo(n.createdAt)}
                  {n.data?.listingId ? (
                    <>
                      {" "}
                      • <Link className="text-brand-400" href={`/listings/${n.data.listingId}`}>listing</Link>
                    </>
                  ) : null}
                  {n.data?.vehicleId ? (
                    <>
                      {" "}
                      • <Link className="text-brand-400" href={`/inventory/${n.data.vehicleId}`}>vehicle</Link>
                    </>
                  ) : null}
                </p>
              </div>
              {!n.readAt ? (
                <Button size="sm" variant="ghost" onClick={() => void markRead(n.id)}>
                  Mark read
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
