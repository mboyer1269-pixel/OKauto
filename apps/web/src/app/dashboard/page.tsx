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
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-44 rounded-2xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="card mx-auto max-w-xl text-center">
        <WifiOff className="mx-auto text-slate-400" />
        <h1 className="mt-3 text-xl font-bold">
          Impossible de charger le tableau de bord
        </h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
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

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-2xl bg-[#0b1320] text-white shadow-sm">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
              Brief du matin
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Bonjour{firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Limite indiquée : {queue?.usedThisMonth ?? 0} / {monthlyLimit}{" "}
              nouvelles annonces ce mois-ci ({remaining} restante
              {remaining > 1 ? "s" : ""}). Ce n’est pas une constante Meta
              confirmée pour le Canada : réglez-la dans Paramètres. Commencez
              par les retraits, puis les absents du flux, puis Aujourd’hui.
            </p>
          </div>
          <Link
            href="/dashboard/listings"
            className="btn bg-blue-500 text-white hover:bg-blue-400"
          >
            Ouvrir le centre de publication{" "}
            <ArrowRight className="ml-2" size={16} />
          </Link>
        </div>
        <div className="grid border-t border-white/10 sm:grid-cols-3">
          <HeroMetric
            label="Inventaire disponible"
            value={stats.availableVehicles}
          />
          <HeroMetric label="Sans annonce active" value={stats.readyToList} />
          <HeroMetric
            label="À retirer maintenant"
            value={stats.staleListings}
            alert={stats.staleListings > 0}
          />
        </div>
      </section>

      <section aria-labelledby="priorities-heading">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Ordre recommandé
            </p>
            <h2
              id="priorities-heading"
              className="mt-1 text-xl font-bold text-slate-950"
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

      {pendingFeed > 0 && (
        <Link
          href="/dashboard/sync"
          className="card flex items-start gap-4 border-amber-200 bg-amber-50 p-5 hover:border-amber-300"
        >
          <AlertTriangle className="mt-0.5 text-amber-700" />
          <div>
            <h2 className="font-bold text-amber-950">
              {formatNumber(pendingFeed)} véhicule
              {pendingFeed > 1 ? "s" : ""} absent
              {pendingFeed > 1 ? "s" : ""} du flux à confirmer
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              Le garde-fou n’a marqué aucun vendu. Confirmez vendu ou garder
              dans Synchronisation.
            </p>
          </div>
        </Link>
      )}

      {queue && queue.todayPicks.length > 0 && (
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Selon l’âge en stock
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                File du jour
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              {queue.usedThisMonth}/{monthlyLimit} ce mois-ci
            </p>
          </div>
          <div className="grid gap-3">
            {queue.todayPicks.map((pick) => (
              <div
                key={pick.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center"
              >
                <div className="h-16 w-full overflow-hidden rounded-lg bg-slate-100 sm:w-24">
                  {pick.photoUrl && (
                    <img
                      src={pick.photoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-950">
                    {vehicleLabel(pick)}
                  </p>
                  <p className="text-sm text-slate-500">
                    Stock {pick.stockNumber ?? "—"} · {pick.daysInStock} j en
                    stock · {formatCurrency(pick.advertisedPrice)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
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
        <div className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`rounded-lg p-2 ${syncHealthy ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
              >
                <RefreshCw size={20} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">
                  Synchronisation {organizationName}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
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
          <div className="mt-5 flex flex-col gap-3 border-t pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <Clock3 size={16} /> Dernière réussite :{" "}
              {formatDateTime(sync?.lastSyncAt)}
            </span>
            <Link
              href="/dashboard/sync"
              className="font-semibold text-brand-700 hover:underline"
            >
              Voir la synchronisation
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="card flex items-center gap-4 p-5 sm:p-6">
            <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
              <Car size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Inventaire total</p>
              <p className="text-2xl font-bold tabular-nums text-slate-950">
                {formatNumber(stats.totalVehicles)}
              </p>
              <Link
                href="/dashboard/inventory"
                className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline"
              >
                Parcourir les véhicules
              </Link>
            </div>
          </div>
          <div className="card flex items-center gap-4 p-5">
            <MessageSquare className="text-slate-600" />
            <div>
              <p className="text-sm text-slate-500">Leads ouverts</p>
              <p className="text-xl font-bold">
                {formatNumber(queue?.openLeadCount ?? 0)}
              </p>
              <Link
                href="/dashboard/leads"
                className="text-sm font-semibold text-brand-700 hover:underline"
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
            className="card flex items-center gap-3 p-5 text-left text-sm font-semibold text-brand-700"
          >
            <Download size={18} /> Exporter le catalogue Meta
          </button>
        </div>
      </section>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="border-b border-white/10 px-6 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:px-8">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${alert ? "text-amber-300" : "text-white"}`}
      >
        {formatNumber(value)}
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
    amber: "bg-amber-100 text-amber-800",
    green: "bg-emerald-100 text-emerald-800",
    blue: "bg-blue-100 text-blue-800",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <Link
      href={href}
      className="card group block p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-xs font-bold tracking-widest text-slate-400">
          {step}
        </span>
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p>
        </div>
        <span className="text-3xl font-bold tabular-nums text-slate-950">
          {formatNumber(value)}
        </span>
      </div>
    </Link>
  );
}
