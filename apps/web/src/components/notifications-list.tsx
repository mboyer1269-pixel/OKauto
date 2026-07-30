"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { Card, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  orgId: string | null;
  orgName: string | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  VEHICLE_SOLD: "🚨",
  PRICE_CHANGE: "💲",
  SYNC_FAILED: "⚠️",
  INVITE: "✉️",
  LISTING_STALE: "🕒",
  SYSTEM: "ℹ️",
};

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unread = notifications.filter((n) => !n.readAt).length;

  async function markAll() {
    setBusy(true);
    try {
      await api("/api/v1/notifications/read-all", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    await api(`/api/v1/notifications/${id}/read`, { method: "POST" });
    router.refresh();
  }

  return (
    <Card>
      {unread > 0 ? (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <p className="text-sm text-slate-600">{unread} unread</p>
          <button className="btn-secondary" onClick={markAll} disabled={busy}>
            Mark all read
          </button>
        </div>
      ) : null}
      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          body="Sold-vehicle alerts, price changes, and sync failures will appear here."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {notifications.map((n) => {
            const vehicleId = typeof n.data.vehicleId === "string" ? n.data.vehicleId : null;
            return (
              <li
                key={n.id}
                className={`px-5 py-3.5 ${n.readAt ? "opacity-70" : "bg-brand-50/40"}`}
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden className="mt-0.5">
                    {TYPE_ICONS[n.type] ?? "ℹ️"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {n.orgName ? `${n.orgName} · ` : ""}
                      {timeAgo(n.createdAt)}
                      {vehicleId && n.orgId ? (
                        <>
                          {" · "}
                          <Link
                            className="font-semibold text-brand-600 hover:underline"
                            href={`/o/${n.orgId}/inventory/${vehicleId}`}
                          >
                            View vehicle
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {!n.readAt ? (
                    <button
                      className="shrink-0 text-xs font-semibold text-brand-600 hover:underline"
                      onClick={() => markOne(n.id)}
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
