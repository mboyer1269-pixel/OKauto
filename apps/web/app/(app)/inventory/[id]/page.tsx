"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { formatDateTime, formatMoney, formatNumber, humanize, statusColor, vehicleName } from "@/lib/format";

interface VehicleDetail {
  id: string;
  vin: string | null;
  stockNumber: string | null;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  bodyStyle: string | null;
  fuelType: string | null;
  transmission: string | null;
  drivetrain: string | null;
  mileage: number | null;
  priceCents: number;
  currency: string;
  condition: string;
  exteriorColor: string | null;
  interiorColor: string | null;
  description: string | null;
  status: string;
  photos: { id: string; url: string; position: number }[];
  priceHistory: { id: string; priceCents: number; source: string; createdAt: string }[];
  listings: {
    id: string;
    status: string;
    channel: string;
    title: string;
    externalUrl: string | null;
    assignee: { id: string; name: string } | null;
    createdAt: string;
  }[];
  source: { id: string; name: string; type: string } | null;
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { api, activeRole } = useAuth();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<"professional" | "friendly" | "concise">("professional");
  const [generating, setGenerating] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState("");
  const [listOpen, setListOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ vehicle: VehicleDetail }>(`/vehicles/${id}`);
      setVehicle(res.vehicle);
      setDescription(res.vehicle.description ?? "");
      setPriceEdit((res.vehicle.priceCents / 100).toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vehicle not found");
    }
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setSavedMsg(null);
    try {
      const res = await api<{ text: string; provider: string; removedPhrases: string[] }>(
        `/vehicles/${id}/description:generate`,
        { method: "POST", body: { tone, persist: true } },
      );
      setDescription(res.text);
      setSavedMsg(
        `Generated with ${res.provider} provider${res.removedPhrases.length ? ` — scrubbed: ${res.removedPhrases.join(", ")}` : ""}`,
      );
      await load();
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const saveDescription = async () => {
    await api(`/vehicles/${id}`, { method: "PATCH", body: { description } });
    setSavedMsg("Description saved.");
    await load();
  };

  const savePrice = async () => {
    const cents = Math.round(Number(priceEdit.replace(/[$,]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents < 0) return;
    await api(`/vehicles/${id}`, { method: "PATCH", body: { priceCents: cents } });
    setSavedMsg("Price updated (history recorded).");
    await load();
  };

  const markSold = async () => {
    await api(`/vehicles/${id}/mark-sold`, { method: "POST", body: {} });
    await load();
  };

  const archive = async () => {
    await api(`/vehicles/${id}/archive`, { method: "POST", body: {} });
    router.push("/inventory");
  };

  if (error) return <p role="alert" className="text-red-300">{error}</p>;
  if (!vehicle) return <Spinner />;

  const canManage = activeRole === "ORG_OWNER" || activeRole === "ORG_MANAGER";
  const specs: [string, string][] = [
    ["VIN", vehicle.vin ?? "—"],
    ["Stock #", vehicle.stockNumber ?? "—"],
    ["Body", humanize(vehicle.bodyStyle)],
    ["Fuel", humanize(vehicle.fuelType)],
    ["Transmission", humanize(vehicle.transmission)],
    ["Drivetrain", humanize(vehicle.drivetrain)],
    ["Exterior", vehicle.exteriorColor ?? "—"],
    ["Interior", vehicle.interiorColor ?? "—"],
    ["Condition", humanize(vehicle.condition)],
    ["Source", vehicle.source ? `${vehicle.source.name} (${vehicle.source.type})` : "—"],
  ];

  return (
    <div>
      <PageHeader
        title={vehicleName(vehicle)}
        subtitle={vehicle.vin ?? vehicle.stockNumber ?? undefined}
        actions={
          <>
            <Badge colorClass={statusColor(vehicle.status)}>{humanize(vehicle.status)}</Badge>
            <Button variant="secondary" onClick={() => setListOpen(true)} disabled={vehicle.status === "SOLD" || vehicle.status === "ARCHIVED"}>
              Create listing
            </Button>
            <Button variant="secondary" onClick={() => void markSold()} disabled={vehicle.status === "SOLD"}>
              Mark sold
            </Button>
            {canManage ? (
              <Button variant="danger" onClick={() => void archive()} disabled={vehicle.status === "ARCHIVED"}>
                Archive
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <h2 className="mb-3 font-bold">Photos ({vehicle.photos.length})</h2>
            {vehicle.photos.length === 0 ? (
              <p className="text-sm text-ink-400">No photos synced for this vehicle.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {vehicle.photos.map((p) => (
                  // Raw <img> is intentional: photos are arbitrary external CDN URLs (no next/image domain list).
                  <img key={p.id} src={p.url} alt={`${vehicleName(vehicle)} photo ${p.position + 1}`} className="aspect-[3/2] w-full rounded-lg object-cover" loading="lazy" />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">Listing description</h2>
              <div className="flex items-center gap-2">
                <Select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} aria-label="Description tone">
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="concise">Concise</option>
                </Select>
                <Button size="sm" onClick={() => void generate()} disabled={generating}>
                  {generating ? "Generating…" : "Generate"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void saveDescription()}>
                  Save
                </Button>
              </div>
            </div>
            <textarea
              className="h-56 w-full rounded-lg border border-ink-600 bg-ink-900 p-3 text-sm text-ink-200"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Listing description"
            />
            {savedMsg ? <p className="mt-2 text-xs text-brand-300" role="status">{savedMsg}</p> : null}
            <p className="mt-2 text-xs text-ink-400">
              Generated copy is compliance-checked (misleading-claim scrubber + dealer disclosure footer).
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Listings</h2>
            {vehicle.listings.length === 0 ? (
              <p className="text-sm text-ink-400">Not listed yet.</p>
            ) : (
              <ul className="space-y-2">
                {vehicle.listings.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-900/60 px-3 py-2">
                    <div>
                      <Link href={`/listings/${l.id}`} className="text-sm font-semibold hover:text-brand-300">
                        {l.title}
                      </Link>
                      <p className="text-xs text-ink-400">
                        {l.channel} {l.assignee ? `• ${l.assignee.name}` : ""} • {formatDateTime(l.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {l.externalUrl ? (
                        <a href={l.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-400 hover:text-brand-300">
                          View on Marketplace ↗
                        </a>
                      ) : null}
                      <Badge colorClass={statusColor(l.status)}>{humanize(l.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold">Pricing</h2>
            <div className="flex items-end gap-2">
              <Field label="Price (USD)">
                <Input value={priceEdit} onChange={(e) => setPriceEdit(e.target.value)} inputMode="decimal" />
              </Field>
              <Button size="sm" variant="secondary" onClick={() => void savePrice()}>Update</Button>
            </div>
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-ink-400">History</h3>
            <ul className="space-y-1 text-sm">
              {vehicle.priceHistory.map((h) => (
                <li key={h.id} className="flex justify-between text-ink-400">
                  <span>{formatMoney(h.priceCents, vehicle.currency)}</span>
                  <span className="text-xs">{h.source} • {formatDateTime(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Specs</h2>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {specs.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-400">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs text-ink-400">Mileage</dt>
                <dd className="font-medium">{formatNumber(vehicle.mileage)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <CreateListingModal open={listOpen} onClose={() => setListOpen(false)} vehicleId={vehicle.id} onCreated={() => void load()} />
    </div>
  );
}

function CreateListingModal({ open, onClose, vehicleId, onCreated }: { open: boolean; onClose: () => void; vehicleId: string; onCreated: () => void }) {
  const { api } = useAuth();
  const [members, setMembers] = useState<{ user: { id: string; name: string } }[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<{ members: { user: { id: string; name: string }; status: string }[] }>("/members")
      .then((res) => setMembers(res.members.filter((m) => m.status === "ACTIVE")))
      .catch(() => setMembers([]));
  }, [api, open]);

  const create = async (queue: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ listing: { id: string } }>("/listings", {
        method: "POST",
        body: { vehicleId, assigneeId: assigneeId || null },
      });
      if (queue) {
        await api(`/listings/${res.listing.id}/transition`, { method: "POST", body: { to: "QUEUED" } });
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create listing");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create listing">
      <Field label="Assign to (defaults to you)">
        <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="w-full">
          <option value="">Me</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.name}
            </option>
          ))}
        </Select>
      </Field>
      {error ? <p role="alert" className="mt-2 text-sm text-red-300">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="secondary" onClick={() => void create(false)} disabled={busy}>Save draft</Button>
        <Button onClick={() => void create(true)} disabled={busy}>{busy ? "Creating…" : "Create & queue"}</Button>
      </div>
    </Modal>
  );
}
