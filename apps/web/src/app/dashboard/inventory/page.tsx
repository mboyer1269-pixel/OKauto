"use client";

import { useEffect, useState, useCallback } from "react";
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
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      params.set("page", String(page));
      params.set("limit", "20");

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
      setLoading(false);
    }
  }, [apiFetch, page, search, status]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [search, status]);

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
      alert(
        `${data.imported ?? 0} véhicule(s) importé(s). ${data.errors?.length ?? 0} erreur(s).`,
      );
      await load();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "L’importation CSV a échoué.",
      );
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
      alert(data.error ?? "La description n’a pas pu être générée.");
      return;
    }
    await load();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Inventaire</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(!showImport)}
            className="btn-secondary"
          >
            <Upload size={16} className="mr-2" /> Importer un CSV
          </button>
          <Link href="/dashboard/inventory/new" className="btn-primary">
            <Plus size={16} className="mr-2" /> Ajouter un véhicule
          </Link>
        </div>
      </div>

      {showImport && (
        <div className="card mb-6">
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

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={16}
          />
          <input
            className="input pl-9"
            placeholder="Rechercher par marque, modèle, NIV ou stock…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="AVAILABLE">Disponible</option>
          <option value="PENDING">En attente</option>
          <option value="SOLD">Vendu</option>
          <option value="ARCHIVED">Archivé</option>
        </select>
      </div>

      {!loading && (
        <div className="flex items-center justify-between mb-3 text-sm text-slate-500">
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
        <div className="space-y-3">
          {vehicles.map((v) => (
            <div key={v.id} className="card flex items-center gap-4">
              <div className="w-20 h-14 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                {v.photos?.[0] && (
                  <img
                    src={v.photos[0].url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/dashboard/inventory/${v.id}`}
                  className="font-semibold hover:text-brand-600"
                >
                  {v.year} {v.make} {v.model} {v.trim}
                </Link>
                <p className="text-sm text-slate-500">
                  Stock : {v.stockNumber ?? "—"} · {formatNumber(v.mileage)} km{" "}
                  · {v._count.listings} publication(s)
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(v.price)}</p>
                <span className={getStatusBadgeClass(v.status)}>
                  {formatStatus(v.status)}
                </span>
              </div>
              <button
                onClick={() => handleGenerateDesc(v.id)}
                className="btn-secondary text-xs"
                title="Générer la description"
              >
                <Sparkles size={14} />
              </button>
            </div>
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
