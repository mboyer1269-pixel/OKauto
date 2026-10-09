"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ShieldAlert } from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import { hasMinRole, type RoleType } from "@okauto/shared";

interface DirectorStats {
  monthlyLimit: number;
  availableVehicles: number;
  soldVehicles: number;
  activeListings: number;
  staleListings: number;
  dueForRenewalCount: number;
  openLeadCount: number;
  leadsThisWeek: number;
  dueFollowUps: number;
  memberStats: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
    weekListings: number;
    monthListings: number;
    remainingThisMonth: number;
    active: number;
    stale: number;
    lastActivity: string | null;
  }>;
  agingWithoutListing: Array<{
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    stockNumber: string | null;
    daysInStock: number;
    price: number | null;
  }>;
  dueForRenewal: Array<{
    id: string;
    listedAt: string;
    salesperson: string;
    vehicle: {
      year: number | null;
      make: string | null;
      model: string | null;
      stockNumber: string | null;
    };
  }>;
}

export default function DirectionPage() {
  return (
    <ProtectedRoute>
      <DirectionContent />
    </ProtectedRoute>
  );
}

function DirectionContent() {
  const { apiFetch, role } = useAuth();
  const [stats, setStats] = useState<DirectorStats | null>(null);
  const [error, setError] = useState("");
  const canView = role != null && hasMinRole(role as RoleType, "MANAGER");

  useEffect(() => {
    if (!canView) return;
    apiFetch("/api/v1/analytics/director")
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossible de charger la direction.");
        setStats(await response.json());
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Une erreur est survenue.",
        ),
      );
  }, [apiFetch, canView]);

  const downloadCatalog = async () => {
    const response = await apiFetch("/api/v1/catalog/meta");
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "catalogue-vehicules-meta.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!canView) {
    return (
      <div className="card max-w-lg">
        <h1 className="text-xl font-bold">Direction des ventes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cet écran est réservé à la direction, aux administrateurs et au
          propriétaire.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card max-w-lg">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Directeur des ventes
          </p>
          <h1 className="mt-1 text-2xl font-bold">Tableau de bord équipe</h1>
        </div>
        <button type="button" className="btn-primary" onClick={downloadCatalog}>
          <Download size={16} className="mr-2" />
          Catalogue Meta (CSV)
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Annonces actives" value={stats.activeListings} />
        <Stat label="À retirer" value={stats.staleListings} alert />
        <Stat label="À renouveler" value={stats.dueForRenewalCount} />
        <Stat label="Leads ouverts" value={stats.openLeadCount} />
      </div>

      <section className="card overflow-x-auto p-0">
        <div className="border-b px-5 py-4">
          <h2 className="font-bold">Activité Marketplace par conseiller</h2>
          <p className="text-sm text-muted-foreground">
            Quota de {stats.monthlyLimit} nouvelles annonces / mois par profil
            (limite Meta documentée).
          </p>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Conseiller</th>
              <th className="px-5 py-3">Semaine</th>
              <th className="px-5 py-3">Mois</th>
              <th className="px-5 py-3">Restant</th>
              <th className="px-5 py-3">Actives</th>
              <th className="px-5 py-3">À retirer</th>
              <th className="px-5 py-3">Dernière activité</th>
            </tr>
          </thead>
          <tbody>
            {stats.memberStats.map((member) => (
              <tr key={member.userId} className="border-t">
                <td className="px-5 py-3 font-semibold">
                  {member.name}
                  <div className="text-xs font-normal text-muted-foreground">
                    {member.email}
                  </div>
                </td>
                <td className="px-5 py-3 tabular-nums">{member.weekListings}</td>
                <td className="px-5 py-3 tabular-nums">
                  {member.monthListings}
                </td>
                <td className="px-5 py-3 tabular-nums">
                  {member.remainingThisMonth}
                </td>
                <td className="px-5 py-3 tabular-nums">{member.active}</td>
                <td className="px-5 py-3 tabular-nums">{member.stale}</td>
                <td className="px-5 py-3">
                  {formatDateTime(member.lastActivity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-bold">Stocks âgés sans annonce</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Plus de 21 jours en inventaire, aucune annonce active.
          </p>
          {stats.agingWithoutListing.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun stock prioritaire.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.agingWithoutListing.map((vehicle) => (
                <li key={vehicle.id} className="flex justify-between gap-3">
                  <Link
                    href={`/dashboard/inventory/${vehicle.id}`}
                    className="font-semibold hover:underline"
                  >
                    {[vehicle.year, vehicle.make, vehicle.model]
                      .filter(Boolean)
                      .join(" ")}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {vehicle.stockNumber}
                    </span>
                  </Link>
                  <span className="tabular-nums text-muted-foreground">
                    {vehicle.daysInStock} j · {formatCurrency(vehicle.price)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="flex items-center gap-2 font-bold">
            <ShieldAlert size={18} /> Annonces à renouveler
          </h2>
          {stats.dueForRenewal.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Aucune annonce au-delà du seuil.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {stats.dueForRenewal.map((listing) => (
                <li key={listing.id}>
                  {[
                    listing.vehicle.year,
                    listing.vehicle.make,
                    listing.vehicle.model,
                  ]
                    .filter(Boolean)
                    .join(" ")}{" "}
                  · {listing.salesperson}
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/dashboard/listings"
            className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Ouvrir Publications
          </Link>
        </section>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatNumber(stats.leadsThisWeek)} lead
        {stats.leadsThisWeek > 1 ? "s" : ""} cette semaine ·{" "}
        {formatNumber(stats.dueFollowUps)} relance
        {stats.dueFollowUps > 1 ? "s" : ""} due
        {stats.dueFollowUps > 1 ? "s" : ""}.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${alert && value > 0 ? "text-warning" : ""}`}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}
