"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import {
  formatCurrency,
  formatNumber,
  formatStatus,
  getStatusBadgeClass,
} from "@/lib/utils";
import {
  Search,
  Plus,
  Upload,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";

interface Vehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  mileage: number;
  price: number;
  status: string;
  stockNumber: string;
  vin: string;
  sourceUrl: string | null;
  photos: Array<{ url: string; isPrimary: boolean }>;
  assignedTo: { name: string } | null;
  _count: { listings: number };
}

export default function InventoryPage() {
  return (
    <ProtectedRoute>
      <InventoryContent />
    </ProtectedRoute>
  );
}

function InventoryContent() {
  const { apiFetch } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    if (hasLoaded.current) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status) params.set("status", status);
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("view", "summary");

      const res = await apiFetch(`/api/v1/vehicles?${params}`);
      if (!res.ok) {
        throw new Error(
          `La requête d’inventaire a échoué (HTTP ${res.status}).`,
        );
      }

      const data = await res.json();
      setVehicles(data.vehicles ?? []);
      setPagination({
        total: data.pagination?.total ?? 0,
        totalPages: data.pagination?.totalPages ?? 1,
      });
    } catch (error) {
      console.error("Unable to load inventory:", error);
      setVehicles([]);
      setPagination({ total: 0, totalPages: 1 });
      setLoadError(
        "Impossible de charger l’inventaire. Réessayez; si le problème persiste, redémarrez Suivia Auto.",
      );
    } finally {
      hasLoaded.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, debouncedSearch, page, status]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [debouncedSearch, status]);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await apiFetch("/api/v1/vehicles/import/csv", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "L’importation CSV a échoué.");
      }
      setShowImport(false);
      setCsv("");
      setNotice({
        type: "success",
        text: `${data.imported ?? 0} véhicule(s) importé(s). ${data.errors?.length ?? 0} erreur(s).`,
      });
      await load();
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "L’importation CSV a échoué.",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateDesc = async (id: string) => {
    const response = await apiFetch(
      `/api/v1/vehicles/${id}/generate-description`,
      {
        method: "POST",
      },
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setNotice({
        type: "error",
        text: data.error ?? "La description n’a pas pu être générée.",
      });
      return;
    }
    setNotice({
      type: "success",
      text: "La description Marketplace a été mise à jour.",
    });
    await load();
  };

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[1.5rem] border border-[#dce5ef] bg-white shadow-[0_18px_50px_-38px_rgba(7,20,38,0.65)]">
        <div className="h-1.5 bg-[linear-gradient(90deg,#0b66d8_0%,#0b66d8_68%,#0e9f6e_68%,#0e9f6e_100%)]" />
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7 sm:py-6">
          <div>
            <p className="brand-label text-[11px] font-bold uppercase tracking-[0.18em] text-[#0b66d8]">
              Lot en direct
            </p>
            <div className="mt-2 flex items-end gap-3">
              <h1 className="brand-display text-3xl font-black tracking-[-0.04em] text-[#071426] sm:text-4xl">
                Inventaire
              </h1>
              <span className="mb-1 font-mono text-sm font-bold tabular-nums text-slate-500">
                {formatNumber(pagination.total)} unités
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Recherchez, vérifiez et préparez un véhicule sans attendre le
              chargement complet des photos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowImport(!showImport)}
              className="btn-secondary"
              aria-expanded={showImport}
            >
              <Upload size={16} className="mr-2" /> Importer un CSV
            </button>
            <Link href="/dashboard/inventory/new" className="btn-primary">
              <Plus size={16} className="mr-2" /> Ajouter un véhicule
            </Link>
          </div>
        </div>
      </header>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-md p-1 hover:bg-black/5"
            aria-label="Fermer le message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showImport && (
        <div className="card">
          <h3 className="font-semibold mb-2">Importer un fichier CSV</h3>
          <p className="text-sm text-slate-500 mb-3">
            Colonnes : vin, stockNumber, year, make, model, trim, mileage,
            price, exteriorColor, transmission, fuelType, description
          </p>
          <textarea
            className="input h-32 font-mono text-xs"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="vin,stockNumber,year,make,model,trim,mileage,price&#10;1HGBH41JXMN109186,STK001,2022,Honda,Accord,Sport,25000,24995"
          />
          <button
            onClick={handleImport}
            className="btn-primary mt-3"
            disabled={importing || !csv}
          >
            {importing ? "Importation…" : "Importer"}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Rechercher dans l’inventaire</span>
          <Search className="absolute left-3 top-3 text-slate-400" size={16} />
          <input
            type="search"
            className="input min-h-11 pl-9 pr-9"
            placeholder="Rechercher par marque, modèle, NIV ou stock…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {refreshing && (
            <RefreshCw
              className="absolute right-3 top-3 animate-spin text-[#0b66d8]"
              size={16}
              aria-label="Mise à jour"
            />
          )}
        </label>
        <label className="sm:w-52">
          <span className="sr-only">Filtrer par statut</span>
          <select
            className="input min-h-11"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            <option value="AVAILABLE">Disponible</option>
            <option value="PENDING">En attente</option>
            <option value="SOLD">Vendu</option>
            <option value="ARCHIVED">Archivé</option>
          </select>
        </label>
      </div>

      {!loading && (
        <div
          className="flex items-center justify-between text-sm text-slate-500"
          aria-live="polite"
        >
          <span>{formatNumber(pagination.total)} véhicule(s)</span>
          {pagination.totalPages > 1 && (
            <span>
              Page {page} sur {pagination.totalPages}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded-xl" />
          ))}
        </div>
      ) : loadError ? (
        <div
          className="card border border-red-200 bg-red-50 text-center py-10"
          role="alert"
        >
          <p className="font-semibold text-red-800">
            Inventaire temporairement indisponible
          </p>
          <p className="mt-1 text-sm text-red-700">{loadError}</p>
          <button type="button" onClick={load} className="btn-secondary mt-4">
            Réessayer
          </button>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          Aucun véhicule trouvé. Ajoutez votre premier véhicule ou importez un
          fichier CSV.
        </div>
      ) : (
        <div
          className={`space-y-3 ${refreshing ? "opacity-70" : "opacity-100"}`}
          aria-busy={refreshing}
        >
          {vehicles.map((v) => (
            <article
              key={v.id}
              className="content-auto group flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-[#8eb9e8] sm:flex-row sm:items-center"
            >
              <div className="h-32 w-full flex-shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-20 sm:w-28">
                {v.photos?.[0] && (
                  <img
                    src={v.photos[0].url}
                    alt=""
                    width={224}
                    height={160}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="brand-label inline-flex rounded-md bg-[#edf6ff] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0b4da2]">
                  Stock {v.stockNumber ?? "—"}
                </span>
                <Link
                  href={`/dashboard/inventory/${v.id}`}
                  className="mt-2 block truncate text-base font-black tracking-tight text-[#071426] hover:text-[#0b66d8]"
                >
                  {v.year} {v.make} {v.model} {v.trim}
                </Link>
                <p className="mt-1 text-sm text-slate-500">
                  {formatNumber(v.mileage)} km · {v._count.listings}{" "}
                  publication(s)
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:block sm:min-w-32 sm:text-right">
                <p className="text-lg font-black tabular-nums text-[#071426]">
                  {formatCurrency(v.price)}
                </p>
                <span className={getStatusBadgeClass(v.status)}>
                  {formatStatus(v.status)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleGenerateDesc(v.id)}
                className="btn-secondary min-h-11 text-xs"
                title="Générer la description"
                aria-label={`Générer la description de ${v.year} ${v.make} ${v.model}`}
              >
                <Sparkles size={14} className="sm:mr-0" />
                <span className="ml-2 sm:sr-only">Générer la description</span>
              </button>
            </article>
          ))}
        </div>
      )}

      {!loading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            className="btn-secondary"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
          >
            <ChevronLeft size={16} className="mr-1" /> Précédente
          </button>
          <span className="text-sm text-slate-500">
            Page {page} sur {pagination.totalPages}
          </span>
          <button
            className="btn-secondary"
            onClick={() =>
              setPage((current) => Math.min(pagination.totalPages, current + 1))
            }
            disabled={page === pagination.totalPages}
          >
            Suivante <ChevronRight size={16} className="ml-1" />
          </button>
        </div>
      )}
    </div>
  );
}
