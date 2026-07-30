"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { allowedTransitions, type ListingStatus } from "@okauto/shared";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { formatDateTime, formatMoney, humanize, statusColor } from "@/lib/format";

interface ListingDetail {
  id: string;
  status: ListingStatus;
  channel: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  externalUrl: string | null;
  failureReason: string | null;
  postedAt: string | null;
  removedAt: string | null;
  vehicle: { id: string; year: number | null; make: string; model: string; status: string };
  assignee: { id: string; name: string } | null;
  events: {
    id: string;
    actorType: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
  }[];
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ listing: ListingDetail }>(`/listings/${id}`);
      setListing(res.listing);
      setExternalUrl(res.listing.externalUrl ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Listing not found");
    }
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const transition = async (to: ListingStatus) => {
    setActionMsg(null);
    try {
      await api(`/listings/${id}/transition`, {
        method: "POST",
        body: {
          to,
          externalUrl: to === "LIVE" && externalUrl ? externalUrl : undefined,
          failureReason: to === "ATTENTION" ? "Marked from dashboard" : undefined,
        },
      });
      await load();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Transition failed");
    }
  };

  if (error) return <p role="alert" className="text-red-300">{error}</p>;
  if (!listing) return <Spinner />;

  const nextStates = allowedTransitions(listing.status);

  return (
    <div>
      <PageHeader
        title={listing.title}
        subtitle={`${listing.channel} • ${listing.assignee?.name ?? "unassigned"}`}
        actions={<Badge colorClass={statusColor(listing.status)}>{humanize(listing.status)}</Badge>}
      />

      {actionMsg ? <p role="alert" className="mb-4 rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-300">{actionMsg}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="mb-3 font-bold">Actions</h2>
            {nextStates.length === 0 ? (
              <p className="text-sm text-ink-400">This listing is in a terminal state.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {nextStates.map((to) => (
                  <Button
                    key={to}
                    size="sm"
                    variant={to === "LIVE" ? "primary" : to === "ENDED" || to === "REMOVED" ? "danger" : "secondary"}
                    onClick={() => void transition(to)}
                  >
                    → {humanize(to)}
                  </Button>
                ))}
              </div>
            )}
            {nextStates.includes("LIVE") ? (
              <div className="mt-3">
                <Field label="Marketplace URL (when marking live manually)">
                  <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://www.facebook.com/marketplace/item/…" />
                </Field>
              </div>
            ) : null}
            {listing.failureReason ? (
              <p className="mt-3 rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">
                Failure: {listing.failureReason}
              </p>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Description</h2>
            <pre className="whitespace-pre-wrap rounded-lg bg-ink-900 p-3 text-sm text-ink-200">{listing.description ?? "—"}</pre>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold">Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-400">Price</dt><dd className="font-semibold">{formatMoney(listing.priceCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-400">Vehicle</dt>
                <dd>
                  <Link href={`/inventory/${listing.vehicle.id}`} className="text-brand-400 hover:text-brand-300">
                    {listing.vehicle.year} {listing.vehicle.make} {listing.vehicle.model}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between"><dt className="text-ink-400">Vehicle status</dt><dd><Badge colorClass={statusColor(listing.vehicle.status)}>{humanize(listing.vehicle.status)}</Badge></dd></div>
              <div className="flex justify-between"><dt className="text-ink-400">Posted</dt><dd>{formatDateTime(listing.postedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-400">Removed</dt><dd>{formatDateTime(listing.removedAt)}</dd></div>
              {listing.externalUrl ? (
                <div className="flex justify-between">
                  <dt className="text-ink-400">URL</dt>
                  <dd>
                    <a href={listing.externalUrl} target="_blank" rel="noreferrer" className="text-brand-400 hover:text-brand-300">
                      Open ↗
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">History</h2>
            <ol className="relative space-y-3 border-l border-ink-700 pl-4">
              {listing.events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-brand-500" aria-hidden />
                  <p className="font-semibold">
                    {e.fromStatus ? `${humanize(e.fromStatus)} → ` : ""}
                    {humanize(e.toStatus)}
                  </p>
                  <p className="text-xs text-ink-400">
                    {e.actorType} • {formatDateTime(e.createdAt)}
                  </p>
                  {e.note ? <p className="mt-0.5 text-xs text-ink-400">{e.note}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
