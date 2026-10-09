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

  if (loading)
    return <div className="animate-pulse h-64 bg-slate-200 rounded-xl" />;
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
        className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
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

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="text-sm text-brand-600 mb-4 hover:underline"
      >
        ← Retour à l’inventaire
      </button>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/3">
          <div className="card">
            {photos[0] ? (
              <img
                src={photos[0].url}
                alt=""
                className="w-full rounded-lg mb-4"
              />
            ) : (
              <div className="w-full h-48 bg-slate-100 rounded-lg mb-4" />
            )}
            <h1 className="text-xl font-bold">
              {String(vehicle.year)} {String(vehicle.make)}{" "}
              {String(vehicle.model)} {String(vehicle.trim ?? "")}
            </h1>
            <p className="text-2xl font-bold text-brand-600 mt-2">
              {formatCurrency(vehicle.price as number)}
            </p>
            <span
              className={`${getStatusBadgeClass(vehicle.status as string)} mt-2`}
            >
              {formatStatus(vehicle.status as string)}
            </span>
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <strong>Stock :</strong>{" "}
                {(vehicle.stockNumber as string) ?? "—"}
              </p>
              <p>
                <strong>VIN:</strong> {(vehicle.vin as string) ?? "—"}
              </p>
              <p>
                <strong>Kilométrage :</strong>{" "}
                {formatNumber(vehicle.mileage as number)} km
              </p>
              <p>
                <strong>État :</strong> {(vehicle.condition as string) ?? "—"}
              </p>
              <p>
                <strong>Couleur :</strong>{" "}
                {(vehicle.exteriorColor as string) ?? "—"}
              </p>
              <p>
                <strong>Transmission :</strong>{" "}
                {(vehicle.transmission as string) ?? "—"}
                <VinBadge field="transmission" />
              </p>
              <p>
                <strong>Rouage :</strong>{" "}
                {(vehicle.drivetrain as string) ?? "—"}
                <VinBadge field="drivetrain" />
              </p>
              <p>
                <strong>Moteur :</strong> {(vehicle.engine as string) ?? "—"}
                <VinBadge field="engine" />
              </p>
            </div>
            {decodeError && (
              <p className="mt-3 p-2 bg-red-50 text-red-700 rounded-lg text-xs">
                {decodeError}
              </p>
            )}
            <label className="mt-4 flex items-start gap-2 text-xs text-slate-700">
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
            <div className="flex flex-wrap gap-2 mt-4">
              {Boolean(vehicle.vin) && (
                <button
                  onClick={handleDecodeVin}
                  className="btn-secondary text-xs"
                >
                  <Search size={14} className="mr-1" /> Décoder le NIV
                </button>
              )}
              <button
                onClick={handleGenerateDesc}
                className="btn-secondary text-xs"
              >
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
          </div>
        </div>
        <div className="lg:w-2/3 space-y-6">
          <PhotoManager vehicleId={id} photos={photos} onUpdate={load} />
          <div className="card">
            <h2 className="font-semibold mb-3">Description</h2>
            <p className="text-sm whitespace-pre-wrap">
              {marketplaceDraft?.description ??
                (vehicle.description as string) ??
                "Aucune description pour le moment."}
            </p>
          </div>
          <div className="card">
            <h2 className="font-semibold mb-3">Historique des publications</h2>
            {listings.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucune publication pour le moment.
              </p>
            ) : (
              <div className="space-y-2">
                {listings.map((l) => (
                  <div
                    key={l.id as string}
                    className="flex justify-between text-sm border-b pb-2"
                  >
                    <span>
                      {(l.user as { name: string })?.name} ·{" "}
                      <span className={getStatusBadgeClass(l.status as string)}>
                        {formatStatus(l.status as string)}
                      </span>
                    </span>
                    <span className="text-slate-500">
                      {formatDateTime(l.listedAt as string)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
