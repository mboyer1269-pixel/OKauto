"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { CompletenessRing } from "@/components/completeness-ring";
import {
  cn,
  formatCurrency,
  formatNumber,
  formatStatus,
  getStatusBadgeClass,
} from "@/lib/utils";
import {
  completeness,
  daysInStock,
  daysTone,
  isInventoryShortcutTarget,
  MARKETPLACE_LABEL,
  marketplaceStatus,
  matchesSavedView,
  SAVED_VIEWS,
  type MarketplaceStatus,
  type SavedView,
} from "@/lib/inventory-ui";
import { FadeIn } from "@/components/fade-in";
import { CockpitSkeleton } from "@/components/cockpit-skeleton";
import {
  Search,
  Plus,
  Upload,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Copy,
  Check,
  ArrowUpDown,
} from "lucide-react";

interface Vehicle {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  price: number | null;
  status: string;
  stockNumber: string | null;
  vin: string | null;
  createdAt?: string;
  engine?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  description?: string | null;
  photos: Array<{ url: string; isPrimary: boolean }>;
  assignedTo: { name: string } | null;
  listings?: Array<{
    status: string;
    listedAt?: string | null;
    lastRenewedAt?: string | null;
  }>;
  _count: { listings: number };
}

type SortKey = "year" | "price" | "mileage" | "days" | "completeness" | "name";

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
  const [inventoryType, setInventoryType] = useState("");
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
  const [view, setView] = useState<SavedView>("all");
  const [sortKey, setSortKey] = useState<SortKey>("days");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [cursor, setCursor] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (hasLoaded.current) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status) params.set("status", status);
      if (inventoryType) params.set("inventoryType", inventoryType);
      params.set("page", String(page));
      params.set("limit", "50");
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
        "Impossible de charger l’inventaire. Réessayez; si le problème persiste, redémarrez Suivia.",
      );
    } finally {
      hasLoaded.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, debouncedSearch, inventoryType, page, status]);

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
  useEffect(() => setPage(1), [debouncedSearch, inventoryType, status]);

  const filtered = useMemo(() => {
    const rows = vehicles.filter((vehicle) => matchesSavedView(vehicle, view));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const name = (v: Vehicle) =>
        `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""} ${v.trim ?? ""}`;
      switch (sortKey) {
        case "year":
          return ((a.year ?? 0) - (b.year ?? 0)) * dir;
        case "price":
          return ((Number(a.price) || 0) - (Number(b.price) || 0)) * dir;
        case "mileage":
          return ((a.mileage ?? 0) - (b.mileage ?? 0)) * dir;
        case "days":
          return (daysInStock(a.createdAt) - daysInStock(b.createdAt)) * dir;
        case "completeness":
          return (
            (completeness(a).percent - completeness(b).percent) * dir
          );
        default:
          return name(a).localeCompare(name(b), "fr") * dir;
      }
    });
  }, [vehicles, view, sortKey, sortDir]);

  useEffect(() => {
    setCursor(0);
  }, [filtered.length, view, page]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isInventoryShortcutTarget(event.target)) return;
      if (filtered.length === 0) return;
      if (event.key === "j" || event.key === "J") {
        event.preventDefault();
        setCursor((current) => Math.min(filtered.length - 1, current + 1));
      } else if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        setCursor((current) => Math.max(0, current - 1));
      } else if (event.key === "Enter") {
        const row = filtered[cursor];
        if (row) window.location.assign(`/dashboard/inventory/${row.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, cursor]);

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

  const copyVin = async (vin: string, id: string) => {
    try {
      await navigator.clipboard.writeText(vin);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setNotice({ type: "error", text: "Impossible de copier le NIV." });
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const compact = density === "compact";

  return (
    <FadeIn className="space-y-5">
      <header className="cockpit-scan card overflow-hidden p-0">
        <div className="h-1.5 bg-gradient-to-r from-primary via-[hsl(var(--brand-cyan))] to-signal" />
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7 sm:py-6">
          <div>
            <p className="brand-label text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              Lot en direct
            </p>
            <div className="mt-2 flex items-end gap-3">
              <h1 className="brand-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Inventaire
              </h1>
              <span className="mb-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {formatNumber(pagination.total)} unités
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Tableau dense : jours en stock, Marketplace, complétude. J/K pour
              naviguer, Entrée pour ouvrir.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDensity((current) =>
                  current === "compact" ? "comfortable" : "compact",
                )
              }
              className="btn-secondary"
            >
              {compact ? "Confortable" : "Compact"}
            </button>
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
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-signal/30 bg-signal/10 text-signal"}`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fermer le message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showImport && (
        <div className="card">
          <h3 className="mb-2 font-semibold">Importer un fichier CSV</h3>
          <p className="mb-3 text-sm text-muted-foreground">
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

      <div
        role="tablist"
        aria-label="Vues enregistrées"
        className="cockpit-panel flex flex-wrap gap-1 p-1"
      >
        {SAVED_VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => setView(item.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              view === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="cockpit-panel grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-[1fr_13rem_13rem]">
        <label className="relative flex-1">
          <span className="sr-only">Rechercher dans l’inventaire</span>
          <Search
            className="absolute left-3 top-3 text-muted-foreground"
            size={16}
          />
          <input
            type="search"
            className="input min-h-11 pl-9 pr-9"
            placeholder="Rechercher par marque, modèle, NIV ou stock…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {refreshing && (
            <RefreshCw
              className="absolute right-3 top-3 animate-spin text-primary"
              size={16}
              aria-label="Mise à jour"
            />
          )}
        </label>
        <label>
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
        <label>
          <span className="sr-only">Filtrer par type d’inventaire</span>
          <select
            className="input min-h-11"
            value={inventoryType}
            onChange={(event) => setInventoryType(event.target.value)}
          >
            <option value="">Neufs et occasion</option>
            <option value="NEW">Véhicules neufs</option>
            <option value="USED">Véhicules d’occasion</option>
            <option value="DEMO">Démonstrateurs</option>
          </select>
        </label>
      </div>

      {!loading && (
        <div
          className="flex items-center justify-between text-sm text-muted-foreground"
          aria-live="polite"
        >
          <span>
            {formatNumber(filtered.length)} affiché(s) sur{" "}
            {formatNumber(pagination.total)}
          </span>
          {pagination.totalPages > 1 && (
            <span>
              Page {page} sur {pagination.totalPages}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <CockpitSkeleton rows={6} />
      ) : loadError ? (
        <div
          className="card border border-destructive/30 bg-destructive/10 py-10 text-center"
          role="alert"
        >
          <p className="font-semibold text-destructive">
            Inventaire temporairement indisponible
          </p>
          <p className="mt-1 text-sm text-destructive/80">{loadError}</p>
          <button type="button" onClick={load} className="btn-secondary mt-4">
            Réessayer
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-12 text-center text-muted-foreground">
          Aucun véhicule trouvé. Ajoutez votre premier véhicule ou importez un
          fichier CSV.
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3" aria-busy={refreshing}>
            {filtered.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                copied={copiedId === vehicle.id}
                onCopyVin={copyVin}
                onGenerate={() => handleGenerateDesc(vehicle.id)}
              />
            ))}
          </div>

          <div
            ref={tableRef}
            className={cn(
              "cockpit-panel hidden overflow-x-auto md:block",
              refreshing && "opacity-70",
            )}
            aria-busy={refreshing}
          >
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Photo</th>
                  <SortHeader
                    label="Véhicule"
                    active={sortKey === "name"}
                    dir={sortDir}
                    onClick={() => toggleSort("name")}
                  />
                  <th className="px-2 py-2 font-mono">Stock</th>
                  <th className="px-2 py-2 font-mono">NIV</th>
                  <SortHeader
                    label="Km"
                    active={sortKey === "mileage"}
                    dir={sortDir}
                    onClick={() => toggleSort("mileage")}
                  />
                  <SortHeader
                    label="Prix"
                    active={sortKey === "price"}
                    dir={sortDir}
                    onClick={() => toggleSort("price")}
                  />
                  <SortHeader
                    label="Jours"
                    active={sortKey === "days"}
                    dir={sortDir}
                    onClick={() => toggleSort("days")}
                  />
                  <th className="px-2 py-2">Marketplace</th>
                  <SortHeader
                    label="Fiche"
                    active={sortKey === "completeness"}
                    dir={sortDir}
                    onClick={() => toggleSort("completeness")}
                  />
                  <th className="px-2 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vehicle, index) => {
                  const days = daysInStock(vehicle.createdAt);
                  const tone = daysTone(days);
                  const market = marketplaceStatus(vehicle);
                  const complete = completeness(vehicle);
                  const title = [vehicle.year, vehicle.make, vehicle.model]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr
                      key={vehicle.id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        compact ? "h-12" : "h-16",
                        index === cursor
                          ? "bg-primary/10"
                          : "hover:bg-muted/60",
                      )}
                    >
                      <td className="px-2">
                        <div
                          className={cn(
                            "overflow-hidden rounded-lg bg-muted",
                            compact ? "h-10 w-14" : "h-14 w-[4.5rem]",
                          )}
                        >
                          {vehicle.photos?.[0] && (
                            <img
                              src={vehicle.photos[0].url}
                              alt=""
                              width={72}
                              height={56}
                              loading="lazy"
                              className="photo-dim h-full w-full object-cover"
                            />
                          )}
                        </div>
                      </td>
                      <td className="max-w-[16rem] px-2 py-2">
                        <Link
                          href={`/dashboard/inventory/${vehicle.id}`}
                          className="block truncate font-semibold tracking-tight text-foreground hover:text-primary"
                        >
                          {title}
                          {vehicle.trim ? (
                            <span className="ml-1 font-medium text-muted-foreground">
                              {vehicle.trim}
                            </span>
                          ) : null}
                        </Link>
                        <span
                          className={cn(
                            getStatusBadgeClass(vehicle.status),
                            "mt-1",
                          )}
                        >
                          {formatStatus(vehicle.status)}
                        </span>
                      </td>
                      <td className="px-2 font-mono text-xs tabular-nums">
                        {vehicle.stockNumber ?? "—"}
                      </td>
                      <td className="px-2">
                        {vehicle.vin ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground hover:text-foreground"
                            onClick={() => copyVin(vehicle.vin!, vehicle.id)}
                            title="Copier le NIV"
                          >
                            {vehicle.vin.slice(0, 8)}…
                            {copiedId === vehicle.id ? (
                              <Check size={12} className="text-signal" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 font-mono text-xs tabular-nums">
                        {formatNumber(vehicle.mileage)}
                      </td>
                      <td className="px-2 font-mono text-sm font-semibold tabular-nums">
                        {formatCurrency(vehicle.price)}
                      </td>
                      <td className="px-2">
                        <DaysBar days={days} tone={tone} />
                      </td>
                      <td className="px-2">
                        <MarketDot status={market} />
                      </td>
                      <td className="px-2">
                        <CompletenessRing percent={complete.percent} />
                      </td>
                      <td className="px-2">
                        <button
                          type="button"
                          onClick={() => handleGenerateDesc(vehicle.id)}
                          className="btn-secondary h-9 px-2 text-xs"
                          title="Générer la description"
                          aria-label={`Générer la description de ${title}`}
                        >
                          <Sparkles size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            className="btn-secondary"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
          >
            <ChevronLeft size={16} className="mr-1" /> Précédente
          </button>
          <span className="text-sm text-muted-foreground">
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
    </FadeIn>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th
      className="px-2 py-2"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide"
      >
        {label}
        <ArrowUpDown
          size={12}
          className={active ? "text-primary" : "text-muted-foreground"}
        />
      </button>
    </th>
  );
}

function DaysBar({
  days,
  tone,
}: {
  days: number;
  tone: "signal" | "warning" | "danger";
}) {
  const width = Math.min(100, Math.round((days / 90) * 100));
  return (
    <span className="flex min-w-[4.5rem] flex-col gap-1">
      <span className="font-mono text-xs tabular-nums">{days} j</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "signal" && "bg-signal shadow-[0_0_8px_hsl(var(--signal))]",
            tone === "warning" &&
              "bg-warning shadow-[0_0_8px_hsl(var(--warning))]",
            tone === "danger" &&
              "bg-destructive shadow-[0_0_8px_hsl(var(--destructive))]",
          )}
          style={{ width: `${Math.max(8, width)}%` }}
        />
      </span>
    </span>
  );
}

function MarketDot({ status }: { status: MarketplaceStatus }) {
  const tone = {
    never: "bg-muted-foreground/40",
    active: "bg-signal shadow-[0_0_10px_hsl(var(--signal))]",
    renew: "bg-warning shadow-[0_0_10px_hsl(var(--warning))]",
    sold: "bg-destructive shadow-[0_0_10px_hsl(var(--destructive))]",
  }[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={cn("h-2 w-2 rounded-full", tone)} aria-hidden />
      {MARKETPLACE_LABEL[status]}
    </span>
  );
}

function VehicleCard({
  vehicle,
  copied,
  onCopyVin,
  onGenerate,
}: {
  vehicle: Vehicle;
  copied: boolean;
  onCopyVin: (vin: string, id: string) => void;
  onGenerate: () => void;
}) {
  const days = daysInStock(vehicle.createdAt);
  const market = marketplaceStatus(vehicle);
  const complete = completeness(vehicle);
  const title = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ");
  return (
    <article className="card content-auto flex flex-col gap-3 p-3">
      <div className="h-32 w-full overflow-hidden rounded-xl bg-muted">
        {vehicle.photos?.[0] && (
          <img
            src={vehicle.photos[0].url}
            alt=""
            width={224}
            height={160}
            loading="lazy"
            className="photo-dim h-full w-full object-cover"
          />
        )}
      </div>
      <div>
        <span className="brand-label inline-flex rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
          Stock {vehicle.stockNumber ?? "—"}
        </span>
        <Link
          href={`/dashboard/inventory/${vehicle.id}`}
          className="mt-2 block truncate text-base font-bold tracking-tight hover:text-primary"
        >
          {title} {vehicle.trim}
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatNumber(vehicle.mileage)} km · {days} j ·{" "}
          {MARKETPLACE_LABEL[market]}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-lg font-semibold tabular-nums">
          {formatCurrency(vehicle.price)}
        </p>
        <CompletenessRing percent={complete.percent} />
      </div>
      <div className="flex items-center justify-between">
        {vehicle.vin ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground"
            onClick={() => onCopyVin(vehicle.vin!, vehicle.id)}
          >
            {vehicle.vin.slice(0, 11)}…{copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onGenerate}
          className="btn-secondary min-h-11 text-xs"
          aria-label={`Générer la description de ${title}`}
        >
          <Sparkles size={14} />
          <span className="ml-2">Description</span>
        </button>
      </div>
    </article>
  );
}
