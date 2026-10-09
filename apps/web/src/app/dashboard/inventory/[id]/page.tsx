"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import {
  formatCurrency,
  formatNumber,
  formatStatus,
  getStatusBadgeClass,
  formatDateTime,
} from "@/lib/utils";
import { PhotoManager } from "@/components/photo-manager";
import { CockpitSkeleton } from "@/components/cockpit-skeleton";
import { FadeIn } from "@/components/fade-in";
import {
  carfaxSourceUrlCheckboxState,
  isVinSourcedField,
  type VinDecodeField,
} from "@okauto/shared";
import { ExternalLink, Sparkles, Search } from "lucide-react";

export default function VehicleDetailPage() {
  return (
    <ProtectedRoute>
      <VehicleDetail />
    </ProtectedRoute>
  );
}

function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [decodeError, setDecodeError] = useState("");
  const [carfaxSaving, setCarfaxSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/v1/vehicles/${id}`);
    if (res.ok) setVehicle(await res.json());
    setLoading(false);
  }, [apiFetch, id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDecodeVin = async () => {
    setDecodeError("");
    const res = await apiFetch(`/api/v1/vehicles/${id}/decode-vin`, {
      method: "POST",
    });
    if (res.ok) load();
    else {
      const err = await res.json();
      setDecodeError(
        typeof err.error === "string"
          ? err.error
          : "Le NIV n’a pas pu être décodé.",
      );
    }
  };

  const handleCarfaxLinkToggle = async (checked: boolean) => {
    setCarfaxSaving(true);
    const res = await apiFetch(`/api/v1/vehicles/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ includeCarfaxSourceUrl: checked }),
    });
    if (res.ok) {
      setVehicle((current) =>
        current ? { ...current, includeCarfaxSourceUrl: checked } : current,
      );
    }
    setCarfaxSaving(false);
  };

  const handleGenerateDesc = async () => {
    await apiFetch(`/api/v1/vehicles/${id}/generate-description`, {
      method: "POST",
    });
    load();
  };

  const handleMarkSold = async () => {
    await apiFetch(`/api/v1/vehicles/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SOLD" }),
    });
    load();
  };

  if (loading) return <CockpitSkeleton rows={5} className="max-w-5xl" />;
  if (!vehicle) return <div className="card">Véhicule introuvable.</div>;

  const photos =
    (vehicle.photos as Array<{
      id: string;
      url: string;
      isPrimary: boolean;
    }>) ?? [];
  const listings = (vehicle.listings as Array<Record<string, unknown>>) ?? [];
  const marketplaceDraft = (
    vehicle.marketplaceDrafts as Array<{ description: string }> | undefined
  )?.[0];
  const fromVin = (field: VinDecodeField) =>
    isVinSourcedField(
      {
        vinDecodedAt: vehicle.vinDecodedAt as string | null | undefined,
        vinDecodedFields: vehicle.vinDecodedFields as string[] | undefined,
        year: vehicle.year as number | null,
        make: vehicle.make as string | null,
        model: vehicle.model as string | null,
        trim: vehicle.trim as string | null,
        bodyStyle: vehicle.bodyStyle as string | null,
        engine: vehicle.engine as string | null,
        fuelType: vehicle.fuelType as string | null,
        transmission: vehicle.transmission as string | null,
        drivetrain: vehicle.drivetrain as string | null,
        doors: vehicle.doors as number | null,
        cylinders: vehicle.cylinders as number | null,
      },
      field,
    );
  const VinBadge = ({ field }: { field: VinDecodeField }) =>
    fromVin(field) ? (
      <span
        className="ml-1.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
        title="Complété depuis le NIV (NHTSA vPIC)"
      >
        NIV
      </span>
    ) : null;
  const carfaxLink = carfaxSourceUrlCheckboxState(
    Boolean(
      (vehicle.organization as { includeCarfaxSourceUrl?: boolean } | undefined)
        ?.includeCarfaxSourceUrl,
    ),
    Boolean(vehicle.includeCarfaxSourceUrl),
  );
  const features = (vehicle.features as string[] | undefined) ?? [];
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter((part) => part != null && String(part).length > 0)
    .join(" ");
  const description =
    marketplaceDraft?.description ??
    (vehicle.description as string) ??
    "Aucune description pour le moment.";
  const factoryRows: Array<[string, string, VinDecodeField | null]> = [
    ["Version", String(vehicle.trim ?? "—"), "trim"],
    ["Moteur", String(vehicle.engine ?? "—"), "engine"],
    ["Boîte", String(vehicle.transmission ?? "—"), "transmission"],
    ["Rouage", String(vehicle.drivetrain ?? "—"), "drivetrain"],
    ["Carburant", String(vehicle.fuelType ?? "—"), "fuelType"],
    ["Carrosserie", String(vehicle.bodyStyle ?? "—"), "bodyStyle"],
    ["Portes", vehicle.doors != null ? String(vehicle.doors) : "—", "doors"],
    [
      "Cylindres",
      vehicle.cylinders != null ? String(vehicle.cylinders) : "—",
      "cylinders",
    ],
    ["Couleur ext.", String(vehicle.exteriorColor ?? "—"), null],
    ["Couleur int.", String(vehicle.interiorColor ?? "—"), null],
  ];

  return (
    <FadeIn>
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm text-primary hover:underline"
      >
        ← Retour à l’inventaire
      </button>

      <section className="cockpit-scan card overflow-hidden p-0">
        <div className="relative h-56 bg-muted sm:h-72">
          {photos[0] ? (
            <img
              src={photos[0].url}
              alt=""
              className="photo-dim h-full w-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="brand-label text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                  Stock {String(vehicle.stockNumber ?? "—")}
                </p>
                <h1 className="brand-display mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                  {title}
                </h1>
              </div>
              <p className="font-mono text-3xl font-bold tabular-nums text-primary">
                {formatCurrency(vehicle.price as number)}
              </p>
            </div>
            <span
              className={`${getStatusBadgeClass(vehicle.status as string)} mt-3`}
            >
              {formatStatus(vehicle.status as string)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border p-4">
          {Boolean(vehicle.vin) && (
            <button onClick={handleDecodeVin} className="btn-secondary text-xs">
              <Search size={14} className="mr-1" /> Décoder le NIV
            </button>
          )}
          <button onClick={handleGenerateDesc} className="btn-secondary text-xs">
            <Sparkles size={14} className="mr-1" /> Générer la description
          </button>
          {Boolean(vehicle.sourceUrl) && (
            <a
              href={vehicle.sourceUrl as string}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs"
            >
              <ExternalLink size={14} className="mr-1" /> Page du
              concessionnaire
            </a>
          )}
          {vehicle.status !== "SOLD" && (
            <button onClick={handleMarkSold} className="btn-danger text-xs">
              Marquer vendu
            </button>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Build d’usine
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Données actuellement en fiche (saisie, synchro ou décodage
                  NIV). Un fournisseur de build data arrivera en phase 2.
                </p>
              </div>
              <span className="badge-info">Fiche actuelle</span>
            </div>
            <p className="mb-4 font-mono text-xs tabular-nums text-muted-foreground">
              NIV {String(vehicle.vin ?? "—")}
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              {factoryRows.map(([label, value, field]) => (
                <div key={label} className="rounded-xl bg-muted/60 px-3 py-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                    {field ? <VinBadge field={field} /> : null}
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {decodeError && (
              <p className="mt-3 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                {decodeError}
              </p>
            )}
            <label className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={carfaxLink.checked}
                disabled={
                  carfaxSaving ||
                  !vehicle.sourceUrl ||
                  carfaxLink.lockedByOrganization
                }
                onChange={(e) => void handleCarfaxLinkToggle(e.target.checked)}
              />
              <span>
                Inclure le lien de cette fiche dans la mention Carfax de
                l’annonce (pour tester avant de l’activer partout). Sans URL par
                défaut.
                {carfaxLink.lockedByOrganization
                  ? " Activé pour toute l’organisation (Paramètres) — la case reflète l’état effectif."
                  : null}
              </span>
            </label>
            <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
              <p>
                <span className="text-muted-foreground">PDSF / MSRP : </span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(vehicle.msrp as number)}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Prix affiché : </span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(vehicle.price as number)}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Kilométrage : </span>
                <span className="font-mono tabular-nums">
                  {formatNumber(vehicle.mileage as number)} km
                </span>
              </p>
            </div>
          </div>

          <PhotoManager vehicleId={id} photos={photos} onUpdate={load} />

          <div className="card">
            <h2 className="mb-3 font-semibold">Description</h2>
            <p className="whitespace-pre-wrap text-sm">{description}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-semibold">Aperçu Marketplace</h2>
            <div className="mx-auto w-[17rem] rounded-[1.75rem] border border-border bg-background p-3 shadow-inner">
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {photos[0] ? (
                  <img
                    src={photos[0].url}
                    alt=""
                    className="photo-dim h-36 w-full object-cover"
                  />
                ) : (
                  <div className="h-36 bg-muted" />
                )}
                <div className="space-y-2 p-3">
                  <p className="text-sm font-semibold leading-5">{title}</p>
                  <p className="font-mono text-base font-semibold tabular-nums text-primary">
                    {formatCurrency(vehicle.price as number)}
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {(features.length > 0
                      ? features.slice(0, 8)
                      : description
                          .split("\n")
                          .map((line) => line.replace(/^[-•]\s*/, "").trim())
                          .filter(Boolean)
                          .slice(0, 8)
                    ).map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3 font-semibold">Historique des publications</h2>
            {listings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune publication pour le moment.
              </p>
            ) : (
              <ol className="relative space-y-3 border-l border-border pl-4">
                {listings.map((listing) => (
                  <li key={listing.id as string} className="text-sm">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                    <span>
                      {(listing.user as { name: string })?.name} ·{" "}
                      <span
                        className={getStatusBadgeClass(
                          listing.status as string,
                        )}
                      >
                        {formatStatus(listing.status as string)}
                      </span>
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(listing.listedAt as string)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
