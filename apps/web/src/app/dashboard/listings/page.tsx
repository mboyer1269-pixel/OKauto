"use client";

import { useMemo, useState } from "react";
import { api, ApiClientError, formatDate, formatPrice } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import {
  Badge, Button, EmptyState, ErrorNote, PageHeader, Spinner, TableShell, Td, Th, inputClass,
} from "@/components/ui";

interface ListingRow {
  listing: {
    id: string;
    status: string;
    remoteUrl: string | null;
    publishedAt: string | null;
    createdAt: string;
  };
  vehicle: { id: string; vin: string; year: number; make: string; model: string; trim: string | null; priceCents: number | null; status: string };
  user: { id: string; name: string; email: string };
}

interface ListingList {
  items: ListingRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function ListingsPage() {
  const { currentOrg, user } = useSession();
  const orgId = currentOrg?.orgId;
  const isSalesperson = currentOrg?.role === "SALESPERSON";
  const [status, setStatus] = useState("");
  const [mineOnly, setMineOnly] = useState(isSalesperson);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const path = useMemo(() => {
    if (!orgId) return null;
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (status) params.set("status", status);
    if (mineOnly) params.set("mine", "true");
    return `/api/v1/orgs/${orgId}/listings?${params}`;
  }, [orgId, status, mineOnly, page]);

  const { data, error, loading, reload } = useApi<ListingList>(path);

  async function recordEvent(listingId: string, type: string, message?: string) {
    if (!orgId) return;
    setBusyId(listingId);
    setNotice(null);
    try {
      await api(`/api/v1/orgs/${orgId}/listings/${listingId}/events`, { method: "POST", body: { type, message } });
      reload();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Listings"
        subtitle="Marketplace listing activity across your team. Publishing happens in the Chrome extension — always with a human review."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
          {["DRAFT", "PREPARED", "ACTIVE", "ENDED", "REMOVED", "FAILED"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          My listings only
        </label>
      </div>

      {notice && <p className="mb-2 text-sm text-red-600">{notice}</p>}
      <ErrorNote message={error} />
      {loading && <Spinner />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="No listings yet"
          hint="Install the OpenLot Chrome extension, pick a vehicle, and it will pre-fill the Marketplace form for you to review and publish."
        />
      )}

      {data && data.items.length > 0 && (
        <TableShell>
          <thead className="bg-slate-50">
            <tr>
              <Th>Vehicle</Th>
              <Th>Salesperson</Th>
              <Th>Status</Th>
              <Th>Price</Th>
              <Th>Published</Th>
              <Th>Link</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map(({ listing, vehicle, user: lister }) => {
              const canAct = !isSalesperson || lister.id === user?.id;
              return (
                <tr key={listing.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="font-medium text-slate-800">
                      {vehicle.year} {vehicle.make} {vehicle.model} {vehicle.trim ?? ""}
                    </div>
                    <div className="text-xs text-slate-400">{vehicle.vin}</div>
                  </Td>
                  <Td>{lister.name}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Badge value={listing.status} />
                      {vehicle.status === "SOLD" && listing.status === "ACTIVE" && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          NEEDS REMOVAL
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>{formatPrice(vehicle.priceCents)}</Td>
                  <Td>{formatDate(listing.publishedAt)}</Td>
                  <Td>
                    {listing.remoteUrl ? (
                      <a href={listing.remoteUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                        Open ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {canAct && listing.status === "ACTIVE" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          disabled={busyId === listing.id}
                          onClick={() => recordEvent(listing.id, "REMOVED", "Removed via dashboard")}
                          title="Record that you removed this listing on Marketplace"
                        >
                          Mark removed
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busyId === listing.id}
                          onClick={() => recordEvent(listing.id, "RENEWED", "Renewed on Marketplace")}
                        >
                          Renewed
                        </Button>
                      </div>
                    )}
                    {canAct && (listing.status === "DRAFT" || listing.status === "PREPARED") && (
                      <Button
                        variant="ghost"
                        disabled={busyId === listing.id}
                        onClick={() => recordEvent(listing.id, "PUBLISHED", "Published (recorded manually)")}
                      >
                        Mark published
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
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
    </div>
  );
}
