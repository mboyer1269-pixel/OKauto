"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Car,
  CheckCircle2,
  Clock3,
  Download,
  ListChecks,
  MessageSquare,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { FadeIn } from "@/components/fade-in";
import { CockpitSkeleton } from "@/components/cockpit-skeleton";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";

interface DashboardStats {
  totalVehicles: number;
  availableVehicles: number;
  soldVehicles: number;
  activeListings: number;
  staleListings: number;
  readyToList: number;
  listingsThisWeek: number;
  pendingFeedReview?: number;
  listingsToRemove?: Array<{
    id: string;
    externalUrl: string | null;
    vehicle: {
      id: string;
      year: number | null;
      make: string | null;
      model: string | null;
      stockNumber: string | null;
    };
  }>;
  syncSources: Array<{
    id: string;
    name: string;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  }>;
}

interface TodayPick {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  stockNumber: string | null;
  advertisedPrice: number | null;
  daysInStock: number;
  reasons: string[];
  photoUrl: string | null;
}

interface PublishQueue {
  monthlyLimit: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  staleCount: number;
  dueForRenewalCount: number;
  openLeadCount: number;
  todayPicks: TodayPick[];
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function vehicleLabel(pick: TodayPick) {
  return [pick.year, pick.make, pick.model].filter(Boolean).join(" ");
}

function DashboardContent() {
  const { apiFetch, user, organization } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queue, setQueue] = useState<PublishQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch("/api/v1/analytics/dashboard"),
      apiFetch("/api/v1/analytics/publish-queue"),
    ])
      .then(async ([dashboardResponse, queueResponse]) => {
        if (!dashboardResponse.ok)
          throw new Error("La vue du matin ne peut pas être chargée.");
        const dashboard = await dashboardResponse.json();
        setStats(dashboard);
        if (queueResponse.ok) setQueue(await queueResponse.json());
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Une erreur est survenue.",
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch]);

  if (loading) {
    return <CockpitSkeleton rows={5} className="max-w-5xl" />;
  }

  if (error || !stats) {
    return (
      <div className="card mx-auto max-w-xl text-center">
        <WifiOff className="mx-auto text-muted-foreground" />
        <h1 className="mt-3 text-xl font-bold">
          Impossible de charger le tableau de bord
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <button type="button" className="btn-primary mt-5" onClick={load}>
          Réessayer
        </button>
      </div>
    );
  }

  const sync = stats.syncSources[0];
  const syncHealthy = sync?.lastSyncStatus === "success";
  const firstName = user?.name?.split(" ")[0] ?? "";
  const organizationName = organization?.name?.trim() || "votre concession";
  const remaining = queue?.remainingThisMonth ?? 0;
  const monthlyLimit = queue?.monthlyLimit ?? 5;
  const pendingFeed = stats.pendingFeedReview ?? 0;
  const listingsToRemove = stats.listingsToRemove ?? [];
  const ageBuckets = ageFromPicks(queue?.todayPicks ?? []);

  return (
    <FadeIn className="space-y-7">
      <section className="cockpit-scan overflow-hidden rounded-2xl border border-sidebar-accent/20 bg-sidebar text-sidebar-foreground shadow-[0_0_40px_hsl(var(--sidebar-accent)/0.08)]">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-accent">
              Brief du matin
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Bonjour{firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-sidebar-foreground/70">
              Limite indiquée : {queue?.usedThisMonth ?? 0} / {monthlyLimit}{" "}
              nouvelles annonces ce mois-ci ({remaining} restante
              {remaining > 1 ? "s" : ""}). Ce n’est pas une constante Meta
              confirmée pour le Canada : réglez-la dans Paramètres. Commencez
              par les retraits, puis les absents du flux, puis Aujourd’hui.
            </p>
          </div>
          <Link href="/dashboard/listings" className="btn-primary">
            Ouvrir le centre de publication{" "}
            <ArrowRight className="ml-2" size={16} />
          </Link>
        </div>
        <div className="grid border-t border-white/10 sm:grid-cols-4">
          <HeroMetric label="Sans annonce active" value={stats.readyToList} />
          <HeroMetric
            label="Publications / quota"
            value={queue?.usedThisMonth ?? 0}
            suffix={`/ ${monthlyLimit}`}
          />
          <HeroMetric
            label="À renouveler"
            value={queue?.dueForRenewalCount ?? 0}
            alert={(queue?.dueForRenewalCount ?? 0) > 0}
          />
          <HeroMetric
            label="Leads ouverts"
            value={queue?.openLeadCount ?? 0}
          />
        </div>
      </section>

      <section aria-labelledby="priorities-heading">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Ordre recommandé
            </p>
            <h2
              id="priorities-heading"
              className="mt-1 text-xl font-bold text-foreground"
            >
              Priorités opérationnelles
            </h2>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <PriorityCard
            step="01"
            icon={AlertTriangle}
            title="Retraits à confirmer"
            value={stats.staleListings}
            detail={
              stats.staleListings
                ? "Véhicules vendus ou disparus du flux."
                : "Aucun véhicule vendu encore affiché."
            }
            href="/dashboard/listings"
            tone={stats.staleListings ? "amber" : "green"}
          />
          <PriorityCard
            step="02"
            icon={ListChecks}
            title="À publier aujourd’hui"
            value={queue?.todayPicks.length ?? stats.readyToList}
            detail={`${remaining} créneau${remaining > 1 ? "x" : ""} Meta restant${remaining > 1 ? "s" : ""} ce mois-ci.`}
            href="/dashboard/listings"
            tone="blue"
          />
          <PriorityCard
            step="03"
            icon={CheckCircle2}
            title="Annonces à renouveler"
            value={queue?.dueForRenewalCount ?? 0}
            detail="Annonces Marketplace trop vieilles : republiez-les à la main."
            href="/dashboard/listings"
            tone="slate"
          />
        </div>
      </section>

      {listingsToRemove.length > 0 && (
        <section
          className="card space-y-3 border-destructive/30 bg-destructive/10 p-5"
          aria-labelledby="listings-to-remove-heading"
        >
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-0.5 text-destructive" />
            <div>
              <h2 id="listings-to-remove-heading" className="font-bold">
                Annonce à retirer
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatNumber(listingsToRemove.length)} annonce
                {listingsToRemove.length > 1 ? "s" : ""} encore active
                {listingsToRemove.length > 1 ? "s" : ""} pour un véhicule vendu
                ou absent du flux.
              </p>
            </div>
          </div>
          <ul className="space-y-2">
            {listingsToRemove.map((listing) => {
              const label = [
                listing.vehicle.year,
                listing.vehicle.make,
                listing.vehicle.model,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li
                  key={listing.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {label || "Véhicule"}
                    {listing.vehicle.stockNumber
                      ? ` · ${listing.vehicle.stockNumber}`
                      : ""}
                  </span>
                  <span className="flex flex-wrap gap-3">
                    {listing.externalUrl ? (
                      <a
                        href={listing.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-primary hover:underline"
                      >
                        Ouvrir l’annonce
                      </a>
                    ) : null}
                    <Link
                      href="/dashboard/listings?queue=remove"
                      className="font-semibold text-primary hover:underline"
                    >
                      Centre de publication
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pendingFeed > 0 && (
        <Link
          href="/dashboard/sync"
          className="card flex items-start gap-4 border-warning/30 bg-warning/10 p-5 hover:border-warning"
        >
          <AlertTriangle className="mt-0.5 text-warning" />
          <div>
            <h2 className="font-bold">
              {formatNumber(pendingFeed)} véhicule
              {pendingFeed > 1 ? "s" : ""} à vérifier
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Absents du flux, pas encore validés. Ils ne comptent pas dans
              l’inventaire. Confirmez vendu ou garder dans Synchronisation.
            </p>
          </div>
        </Link>
      )}

      {queue && queue.todayPicks.length > 0 && (
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Selon l’âge en stock
              </p>
              <h2 className="mt-1 text-lg font-bold">File du jour</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {queue.usedThisMonth}/{monthlyLimit} ce mois-ci
            </p>
          </div>
          <div className="grid gap-3">
            {queue.todayPicks.map((pick) => (
              <div
                key={pick.id}
                className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"
              >
                <div className="h-20 w-full overflow-hidden rounded-lg bg-muted sm:w-32">
                  {pick.photoUrl && (
                    <img
                      src={pick.photoUrl}
                      alt=""
                      className="photo-dim h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{vehicleLabel(pick)}</p>
                  <p className="text-sm text-muted-foreground">
                    Stock {pick.stockNumber ?? "—"} · {pick.daysInStock} j en
                    stock · {formatCurrency(pick.advertisedPrice)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pick.reasons[0]}
                  </p>
                </div>
                <Link
                  href={`/dashboard/listings?prepare=${pick.id}`}
                  className="btn-primary"
                >
                  Publier
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card space-y-5 p-5 sm:p-6">
          <div>
            <h2 className="font-bold">Âge de l’inventaire (file du jour)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Répartition des unités déjà dans Aujourd’hui. Une carte complète
              du lot suivra quand l’API exposera les buckets d’âge.
            </p>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
              <span
                className="bg-signal"
                style={{ width: `${ageBuckets.fresh}%` }}
              />
              <span
                className="bg-warning"
                style={{ width: `${ageBuckets.aging}%` }}
              />
              <span
                className="bg-destructive"
                style={{ width: `${ageBuckets.old}%` }}
              />
            </div>
            <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <li>&lt; 30 j · vert</li>
              <li>30–60 j · ambre</li>
              <li>&gt; 60 j · rouge</li>
            </ul>
          </div>
          <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
            <div className="flex items-start gap-3">
              <div
                className={`rounded-lg p-2 ${syncHealthy ? "bg-signal/15 text-signal" : "bg-destructive/15 text-destructive"}`}
              >
                <RefreshCw size={20} />
              </div>
              <div>
                <h2 className="font-bold">
                  Synchronisation {organizationName}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {syncHealthy
                    ? "Connectée et à jour"
                    : "Une vérification est requise"}
                </p>
              </div>
            </div>
            <span className={syncHealthy ? "badge-success" : "badge-danger"}>
              {syncHealthy ? "Opérationnelle" : "À vérifier"}
            </span>
          </div>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <Clock3 size={16} /> Dernière réussite :{" "}
              {formatDateTime(sync?.lastSyncAt)}
            </span>
            <Link
              href="/dashboard/sync"
              className="font-semibold text-primary hover:underline"
            >
              Voir la synchronisation
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="card flex items-center gap-4 p-5 sm:p-6">
            <div className="rounded-xl bg-muted p-3 text-foreground">
              <Car size={24} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Inventaire total</p>
              <p className="font-mono text-2xl font-bold tabular-nums">
                {formatNumber(stats.totalVehicles)}
              </p>
              <Link
                href="/dashboard/inventory"
                className="mt-1 inline-block text-sm font-semibold text-primary hover:underline"
              >
                Parcourir les véhicules
              </Link>
            </div>
          </div>
          <div className="card flex items-center gap-4 p-5">
            <MessageSquare className="text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Leads ouverts</p>
              <p className="font-mono text-xl font-bold tabular-nums">
                {formatNumber(queue?.openLeadCount ?? 0)}
              </p>
              <Link
                href="/dashboard/leads"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Ouvrir le carnet
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              const response = await apiFetch("/api/v1/catalog/meta");
              if (!response.ok) return;
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "catalogue-vehicules-meta.csv";
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="card flex items-center gap-3 p-5 text-left text-sm font-semibold text-primary"
          >
            <Download size={18} /> Exporter le catalogue Meta
          </button>
        </div>
      </section>
    </FadeIn>
  );
}

function ageFromPicks(picks: TodayPick[]) {
  if (picks.length === 0) return { fresh: 0, aging: 0, old: 0 };
  let fresh = 0;
  let aging = 0;
  let old = 0;
  for (const pick of picks) {
    if (pick.daysInStock < 30) fresh += 1;
    else if (pick.daysInStock <= 60) aging += 1;
    else old += 1;
  }
  const total = picks.length;
  return {
    fresh: Math.round((fresh / total) * 100),
    aging: Math.round((aging / total) * 100),
    old: Math.round((old / total) * 100),
  };
}

function HeroMetric({
  label,
  value,
  alert = false,
  suffix,
}: {
  label: string;
  value: number;
  alert?: boolean;
  suffix?: string;
}) {
  return (
    <div className="border-b border-white/10 px-6 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:px-8">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-sidebar-accent">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-2xl font-bold tabular-nums ${alert ? "text-warning" : "text-sidebar-foreground"}`}
      >
        {formatNumber(value)}
        {suffix ? (
          <span className="ml-1 text-sm font-medium text-sidebar-foreground/50">
            {suffix}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function PriorityCard({
  step,
  icon: Icon,
  title,
  value,
  detail,
  href,
  tone,
}: {
  step: string;
  icon: typeof AlertTriangle;
  title: string;
  value: number;
  detail: string;
  href: string;
  tone: "amber" | "green" | "blue" | "slate";
}) {
  const tones = {
    amber: "bg-warning/15 text-warning",
    green: "bg-signal/15 text-signal",
    blue: "bg-primary/10 text-primary",
    slate: "bg-muted text-muted-foreground",
  };
  return (
    <Link
      href={href}
      className="card group block p-5"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-xs font-bold tracking-widest text-muted-foreground">
          {step}
        </span>
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {detail}
          </p>
        </div>
        <span className="font-mono text-3xl font-bold tabular-nums">
          {formatNumber(value)}
        </span>
      </div>
    </Link>
  );
}
