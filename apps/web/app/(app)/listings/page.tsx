"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LISTING_STATUSES } from "@okauto/shared";
import { useAuth } from "@/lib/auth";
import type { Paginated } from "@/lib/api";
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { formatDateTime, formatMoney, humanize, statusColor } from "@/lib/format";

interface ListingRow {
  id: string;
  status: string;
  channel: string;
  title: string;
  priceCents: number | null;
  externalUrl: string | null;
  failureReason: string | null;
  createdAt: string;
  vehicle: { id: string; year: number | null; make: string; model: string; status: string };
  assignee: { id: string; name: string } | null;
}

const QUICK_FILTERS = ["", "QUEUED", "IN_PROGRESS", "LIVE", "ATTENTION", "NEEDS_REMOVAL"] as const;

export default function ListingsPage() {
  const { api } = useAuth();
  const [status, setStatus] = useState("");
  const [data, setData] = useState<Paginated<ListingRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (status) params.set("status", status);
        if (cursor) params.set("cursor", cursor);
        setData(await api<Paginated<ListingRow>>(`/listings?${params}`));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load listings");
      } finally {
        setLoading(false);
      }
    },
    [api, status],
  );

  useEffect(() => {
    setCursorStack([]);
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader title="Listings" subtitle="Every Marketplace ad your team is working" />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Status filter">
        {QUICK_FILTERS.map((s) => (
          <button
            key={s || "all"}
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === s ? "bg-brand-600 text-white" : "bg-ink-800 text-ink-400 hover:text-ink-200"
            }`}
          >
            {s ? humanize(s) : "All"}
          </button>
        ))}
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="All statuses" className="ml-auto">
          <option value="">All statuses</option>
          {LISTING_STATUSES.map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <p role="alert" className="text-sm text-red-300">{error}</p>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No listings here" hint="Create a listing from any vehicle in Inventory, then queue it for your team." />
      ) : (
        <div className="grid gap-3">
          {data.items.map((l) => (
            <Card key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link href={`/listings/${l.id}`} className="block truncate font-semibold hover:text-brand-300">
                  {l.title}
                </Link>
                <p className="mt-0.5 text-xs text-ink-400">
                  {l.vehicle.year} {l.vehicle.make} {l.vehicle.model} • {l.assignee?.name ?? "unassigned"} • {formatDateTime(l.createdAt)}
                  {l.failureReason ? <span className="text-red-300"> — {l.failureReason}</span> : null}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{formatMoney(l.priceCents)}</span>
                {l.externalUrl ? (
                  <a href={l.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-400 hover:text-brand-300">
                    Marketplace ↗
                  </a>
                ) : null}
                <Badge colorClass={statusColor(l.status)}>{humanize(l.status)}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={cursorStack.length === 0}
          onClick={() => {
            const stack = [...cursorStack];
            stack.pop();
            setCursorStack(stack);
            void load(stack[stack.length - 1]);
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
    </div>
  );
}
