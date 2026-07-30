"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, ApiClientError, formatDate, formatPrice } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import {
  BackLink, Badge, Button, Card, ErrorNote, PageHeader, Spinner, TableShell, Td, Th, inputClass,
} from "@/components/ui";

interface Vehicle {
  id: string;
  vin: string;
  stockNumber: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  bodyStyle: string | null;
  condition: string;
  mileage: number | null;
  priceCents: number | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  transmission: string | null;
  fuelType: string | null;
  drivetrain: string | null;
  engine: string | null;
  doors: number | null;
  description: string | null;
  descriptionSource: string | null;
  features: string[];
  photoUrls: string[];
  status: string;
  source: string;
  updatedAt: string;
}

interface Detail {
  vehicle: Vehicle;
  priceHistory: { id: string; priceCents: number | null; source: string; recordedAt: string }[];
  listings: { id: string; status: string; userId: string; remoteUrl: string | null; publishedAt: string | null; createdAt: string }[];
}

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const { currentOrg } = useSession();
  const orgId = currentOrg?.orgId;
  const path = orgId && params.id ? `/api/v1/orgs/${orgId}/vehicles/${params.id}` : null;
  const { data, error, loading, reload } = useApi<Detail>(path);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string | null>(null);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!data || !orgId) return null;
  const v = data.vehicle;

  async function action(fn: () => Promise<unknown>, successNote: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice(successNote);
      reload();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const generateDescription = () =>
    action(
      () => api(`/api/v1/orgs/${orgId}/vehicles/${v.id}/generate-description`, { method: "POST", body: {} }),
      "Description generated.",
    );

  const setStatus = (status: string) =>
    action(
      () => api(`/api/v1/orgs/${orgId}/vehicles/${v.id}`, { method: "PATCH", body: { status } }),
      `Status set to ${status.toLowerCase()}.`,
    );

  const savePrice = () =>
    action(async () => {
      const cents = Math.round(Number((editPrice ?? "").replace(/[$,\s]/g, "")) * 100);
      if (!Number.isFinite(cents) || cents < 0) throw new ApiClientError(400, "BAD_INPUT", "Enter a valid price");
      await api(`/api/v1/orgs/${orgId}/vehicles/${v.id}`, { method: "PATCH", body: { priceCents: cents } });
      setEditPrice(null);
    }, "Price updated.");

  return (
    <div>
      <BackLink href="/dashboard/inventory" label="Back to inventory" />
      <PageHeader
        title={`${v.year} ${v.make} ${v.model} ${v.trim ?? ""}`}
        subtitle={`VIN ${v.vin}${v.stockNumber ? ` · Stock ${v.stockNumber}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Badge value={v.status} />
            {v.status !== "SOLD" ? (
              <Button variant="danger" disabled={busy} onClick={() => setStatus("SOLD")}>
                Mark sold
              </Button>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={() => setStatus("AVAILABLE")}>
                Mark available
              </Button>
            )}
          </div>
        }
      />
      {notice && <p className="mb-3 text-sm text-indigo-700">{notice}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Specifications">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {(
                [
                  ["Price", editPrice === null ? formatPrice(v.priceCents) : null],
                  ["Mileage", v.mileage !== null ? `${v.mileage.toLocaleString()} mi` : "—"],
                  ["Condition", v.condition],
                  ["Body style", v.bodyStyle ?? "—"],
                  ["Exterior", v.exteriorColor ?? "—"],
                  ["Interior", v.interiorColor ?? "—"],
                  ["Transmission", v.transmission ?? "—"],
                  ["Fuel", v.fuelType ?? "—"],
                  ["Drivetrain", v.drivetrain ?? "—"],
                  ["Engine", v.engine ?? "—"],
                  ["Doors", v.doors ?? "—"],
                  ["Source", v.source],
                ] as const
              ).map(([label, value]) =>
                label === "Price" && editPrice !== null ? (
                  <div key={label}>
                    <dt className="text-xs font-medium uppercase text-slate-400">Price</dt>
                    <dd className="mt-0.5 flex gap-1">
                      <input
                        className={`${inputClass} w-28`}
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        aria-label="New price"
                      />
                      <Button variant="ghost" disabled={busy} onClick={savePrice}>Save</Button>
                    </dd>
                  </div>
                ) : (
                  <div key={label}>
                    <dt className="text-xs font-medium uppercase text-slate-400">{label}</dt>
                    <dd className="mt-0.5 text-slate-800">
                      {value}
                      {label === "Price" && (
                        <button
                          className="ml-2 text-xs text-indigo-600 hover:underline"
                          onClick={() => setEditPrice(v.priceCents !== null ? String(v.priceCents / 100) : "")}
                        >
                          edit
                        </button>
                      )}
                    </dd>
                  </div>
                ),
              )}
            </dl>
            {v.features.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {v.features.map((f) => (
                  <span key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Listing description"
            action={
              <Button variant="secondary" disabled={busy} onClick={generateDescription}>
                {v.description ? "Regenerate with AI" : "Generate with AI"}
              </Button>
            }
          >
            {v.description ? (
              <>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{v.description}</p>
                <p className="mt-2 text-xs text-slate-400">Source: {v.descriptionSource ?? "manual"}</p>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                No description yet. Generate one from the vehicle facts — the AI never invents specs.
              </p>
            )}
          </Card>

          <Card title="Listing history">
            {data.listings.length === 0 ? (
              <p className="text-sm text-slate-400">Nobody has listed this vehicle yet.</p>
            ) : (
              <TableShell>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Status</Th>
                    <Th>Created</Th>
                    <Th>Published</Th>
                    <Th>Marketplace URL</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.listings.map((l) => (
                    <tr key={l.id}>
                      <Td><Badge value={l.status} /></Td>
                      <Td>{formatDate(l.createdAt)}</Td>
                      <Td>{formatDate(l.publishedAt)}</Td>
                      <Td>
                        {l.remoteUrl ? (
                          <a href={l.remoteUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                            Open ↗
                          </a>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={`Photos (${v.photoUrls.length})`}>
            {v.photoUrls.length === 0 ? (
              <p className="text-sm text-slate-400">No photos on file. Photos flow in from feeds/CSV photo URLs.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {v.photoUrls.slice(0, 8).map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                    <Image
                      src={url}
                      alt={`${v.year} ${v.make} ${v.model} photo`}
                      width={300}
                      height={200}
                      unoptimized
                      className="h-24 w-full rounded-lg border border-slate-200 object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </Card>

          <Card title="Price history">
            {data.priceHistory.length === 0 ? (
              <p className="text-sm text-slate-400">No price changes recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.priceHistory.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="text-slate-600">{formatDate(p.recordedAt)}</span>
                    <span className="font-medium text-slate-800">
                      {formatPrice(p.priceCents)} <span className="text-xs text-slate-400">({p.source})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
