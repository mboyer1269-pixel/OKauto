"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface AbsenceVehicle {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  stockNumber: string | null;
  vin: string | null;
  price: string | number | null;
  feedAbsenceNotedAt: string | null;
  photos: Array<{ url: string }>;
  listings: Array<{ status: string; externalUrl: string | null }>;
}

function vehicleName(vehicle: AbsenceVehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

export function FeedAbsenceQueue({
  canManage,
  onChanged,
}: {
  canManage: boolean;
  onChanged?: () => void;
}) {
  const { apiFetch } = useAuth();
  const [vehicles, setVehicles] = useState<AbsenceVehicle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await apiFetch("/api/v1/vehicles/feed-absence");
    if (!response.ok) {
      setError("Impossible de charger les véhicules absents du flux.");
      return;
    }
    const data = await response.json();
    setVehicles(data.vehicles ?? []);
    setSelected([]);
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (action: "sold" | "keep") => {
    if (selected.length === 0) return;
    const label =
      action === "sold"
        ? `Marquer ${selected.length} véhicule(s) comme vendu(s) ? Ils iront dans « À retirer » s’ils ont une annonce.`
        : `Garder ${selected.length} véhicule(s) en inventaire même s’ils sont absents du site ? Ils ne seront plus proposés comme vendus automatiquement.`;
    if (!window.confirm(label)) return;
    setSaving(true);
    setError("");
    const response = await apiFetch("/api/v1/vehicles/feed-absence", {
      method: "POST",
      body: JSON.stringify({ vehicleIds: selected, action }),
    });
    setSaving(false);
    if (!response.ok) {
      setError("La confirmation n’a pas pu être enregistrée.");
      return;
    }
    await load();
    onChanged?.();
  };

  if (vehicles.length === 0) return null;

  const allSelected = selected.length === vehicles.length;

  return (
    <section className="card mb-6 border-amber-200 bg-amber-50/60">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-amber-950">
            Véhicules absents du flux à confirmer
          </h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            {formatNumber(vehicles.length)} véhicule
            {vehicles.length > 1 ? "s" : ""} du lot n’
            {vehicles.length > 1 ? "étaient" : "était"} plus dans le flux
            BuckinghamGM. Le garde-fou n’a <strong>marqué aucun vendu</strong>.
            Confirmez en lot : vendu (retrait Marketplace ensuite) ou garder en
            inventaire.
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {canManage && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              setSelected(allSelected ? [] : vehicles.map((vehicle) => vehicle.id))
            }
          >
            {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving || selected.length === 0}
            onClick={() => void confirm("sold")}
          >
            Confirmer vendu ({selected.length})
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={saving || selected.length === 0}
            onClick={() => void confirm("keep")}
          >
            Garder en inventaire
          </button>
        </div>
      )}

      <ul className="mt-4 grid gap-2">
        {vehicles.map((vehicle) => (
          <li
            key={vehicle.id}
            className="flex items-center gap-3 rounded-xl border border-amber-200 bg-white p-3"
          >
            {canManage && (
              <input
                type="checkbox"
                checked={selected.includes(vehicle.id)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, vehicle.id]
                      : current.filter((id) => id !== vehicle.id),
                  );
                }}
                aria-label={`Sélectionner ${vehicleName(vehicle)}`}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{vehicleName(vehicle)}</p>
              <p className="text-sm text-slate-500">
                Stock {vehicle.stockNumber ?? "—"} · NIV {vehicle.vin ?? "—"} ·{" "}
                {formatCurrency(
                  vehicle.price == null ? null : Number(vehicle.price),
                )}
                {vehicle.listings.some((listing) => listing.status === "ACTIVE")
                  ? " · Annonce Marketplace active"
                  : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
