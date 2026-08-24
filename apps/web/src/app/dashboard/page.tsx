'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Car,
  CheckCircle2,
  Clock3,
  ListChecks,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatDateTime, formatNumber } from '@/lib/utils';

interface DashboardStats {
  totalVehicles: number;
  availableVehicles: number;
  soldVehicles: number;
  activeListings: number;
  staleListings: number;
  readyToList: number;
  listingsThisWeek: number;
  syncSources: Array<{
    id: string;
    name: string;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  }>;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { apiFetch, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    apiFetch('/api/v1/analytics/dashboard')
      .then(async (response) => {
        if (!response.ok) throw new Error('La vue du matin ne peut pas être chargée.');
        return response.json();
      })
      .then(setStats)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Une erreur est survenue.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // apiFetch is stable for the current authentication session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-44 rounded-2xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-28 rounded-xl bg-slate-200" />)}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="card mx-auto max-w-xl text-center">
        <WifiOff className="mx-auto text-slate-400" />
        <h1 className="mt-3 text-xl font-bold">Impossible de charger le tableau de bord</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <button type="button" className="btn-primary mt-5" onClick={load}>
          Réessayer
        </button>
      </div>
    );
  }

  const sync = stats.syncSources[0];
  const syncHealthy = sync?.lastSyncStatus === 'success';
  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-2xl bg-[#0b1320] text-white shadow-sm">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Brief du matin</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Bonjour{firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Votre inventaire BuckinghamGM est prêt. Commencez par les retraits urgents, puis préparez la
              prochaine annonce prioritaire.
            </p>
          </div>
          <Link href="/dashboard/listings" className="btn bg-blue-500 text-white hover:bg-blue-400">
            Ouvrir le centre de publication <ArrowRight className="ml-2" size={16} />
          </Link>
        </div>
        <div className="grid border-t border-white/10 sm:grid-cols-3">
          <HeroMetric label="Inventaire disponible" value={stats.availableVehicles} />
          <HeroMetric label="Sans annonce active" value={stats.readyToList} />
          <HeroMetric label="À retirer maintenant" value={stats.staleListings} alert={stats.staleListings > 0} />
        </div>
      </section>

      <section aria-labelledby="priorities-heading">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Ordre recommandé</p>
            <h2 id="priorities-heading" className="mt-1 text-xl font-bold text-slate-950">
              Priorités opérationnelles
            </h2>
          </div>
          <span className="hidden text-sm text-slate-500 sm:block">Mise à jour en temps réel</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <PriorityCard
            step="01"
            icon={AlertTriangle}
            title="Retraits à confirmer"
            value={stats.staleListings}
            detail={stats.staleListings ? 'Véhicules vendus ou disparus du flux.' : 'Aucun véhicule vendu encore affiché.'}
            href="/dashboard/listings"
            tone={stats.staleListings ? 'amber' : 'green'}
          />
          <PriorityCard
            step="02"
            icon={ListChecks}
            title="Annonces à préparer"
            value={stats.readyToList}
            detail="Sélectionnez les stocks à promouvoir selon votre quota Meta."
            href="/dashboard/listings"
            tone="blue"
          />
          <PriorityCard
            step="03"
            icon={CheckCircle2}
            title="Annonces suivies"
            value={stats.activeListings}
            detail={`${formatNumber(stats.listingsThisWeek)} ajoutée(s) dans les 7 derniers jours.`}
            href="/dashboard/listings"
            tone="slate"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`rounded-lg p-2 ${syncHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                <RefreshCw size={20} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">Synchronisation BuckinghamGM</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {syncHealthy ? 'Connectée et à jour' : 'Une vérification est requise'}
                </p>
              </div>
            </div>
            <span className={syncHealthy ? 'badge-success' : 'badge-danger'}>
              {syncHealthy ? 'Opérationnelle' : 'À vérifier'}
            </span>
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <Clock3 size={16} /> Dernière réussite : {formatDateTime(sync?.lastSyncAt)}
            </span>
            <Link href="/dashboard/sync" className="font-semibold text-brand-700 hover:underline">
              Voir la synchronisation
            </Link>
          </div>
        </div>

        <div className="card flex items-center gap-4 p-5 sm:p-6">
          <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
            <Car size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500">Inventaire total</p>
            <p className="text-2xl font-bold tabular-nums text-slate-950">{formatNumber(stats.totalVehicles)}</p>
            <Link href="/dashboard/inventory" className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline">
              Parcourir les véhicules
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeroMetric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="border-b border-white/10 px-6 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:px-8">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${alert ? 'text-amber-300' : 'text-white'}`}>
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
  tone: 'amber' | 'green' | 'blue' | 'slate';
}) {
  const tones = {
    amber: 'bg-amber-100 text-amber-800',
    green: 'bg-emerald-100 text-emerald-800',
    blue: 'bg-blue-100 text-blue-800',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <Link href={href} className="card group block p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between">
        <span className="font-mono text-xs font-bold tracking-widest text-slate-400">{step}</span>
        <span className={`rounded-lg p-2 ${tones[tone]}`}><Icon size={18} /></span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p>
        </div>
        <span className="text-3xl font-bold tabular-nums text-slate-950">{formatNumber(value)}</span>
      </div>
    </Link>
  );
}
