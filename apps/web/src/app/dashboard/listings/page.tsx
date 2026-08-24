"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  Facebook,
  Gauge,
  History,
  MousePointerClick,
  Radio,
  Search,
  ShieldCheck,
  Zap,
  X,
} from "lucide-react";
import {
  generateMarketplacePackage,
  isFacebookMarketplaceItemUrl,
} from "@okauto/shared";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";

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
  sourceUrl: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  transmission: string | null;
  fuelType: string | null;
  drivetrain: string | null;
  engine: string | null;
  bodyStyle: string | null;
  condition: string | null;
  location: string | null;
  features: string[];
  updatedAt: string;
  photos: Array<{ url: string; isPrimary: boolean }>;
  listings: Array<{ id: string; status: string }>;
}

interface Listing {
  id: string;
  status: "ACTIVE" | "STALE" | "REMOVED" | "SOLD" | "DRAFT";
  listedAt: string;
  removedAt: string | null;
  priceAtListing: number | null;
  externalUrl: string | null;
  vehicle: Vehicle;
  user: { name: string };
}

interface Organization {
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

type Queue = "prepare" | "active" | "remove" | "history";

const MARKETPLACE_CREATE_URL =
  "https://www.facebook.com/marketplace/create/vehicle";
const MARKETPLACE_CONTACT_NAME =
  process.env.NEXT_PUBLIC_MARKETPLACE_CONTACT_NAME?.trim() || "Michael Boyer";
const APP_MESSAGE_SOURCE = "okauto-web";
const EXTENSION_MESSAGE_SOURCE = "okauto-extension";

const QUEUES: Array<{ id: Queue; label: string; icon: typeof Clipboard }> = [
  { id: "prepare", label: "À préparer", icon: Clipboard },
  { id: "active", label: "Publiées", icon: CheckCircle2 },
  { id: "remove", label: "À retirer", icon: AlertTriangle },
  { id: "history", label: "Historique", icon: History },
];

function vehicleName(vehicle: Vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
}

function copyWithLegacyClipboard(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy was rejected");
}

export default function ListingsPage() {
  return (
    <ProtectedRoute>
      <ListingsContent />
    </ProtectedRoute>
  );
}

function ListingsContent() {
  const { apiFetch, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [organization, setOrganization] = useState<Organization>({
    name: "Votre concession",
  });
  const [queue, setQueue] = useState<Queue>("prepare");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingPhotos, setDownloadingPhotos] = useState(false);
  const [launchingMarketplace, setLaunchingMarketplace] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [vehicleResponse, listingResponse, orgResponse] = await Promise.all(
        [
          apiFetch("/api/v1/vehicles?status=AVAILABLE&limit=100&page=1"),
          apiFetch("/api/v1/listings?limit=100&page=1"),
          apiFetch("/api/v1/organizations/current"),
        ],
      );

      if (!vehicleResponse.ok || !listingResponse.ok || !orgResponse.ok) {
        throw new Error("Impossible de charger le centre de publication.");
      }

      const [vehicleData, listingData, orgData] = await Promise.all([
        vehicleResponse.json(),
        listingResponse.json(),
        orgResponse.json(),
      ]);

      let allVehicles: Vehicle[] = vehicleData.vehicles ?? [];
      const totalPages = vehicleData.pagination?.totalPages ?? 1;
      if (totalPages > 1) {
        const pageResponses = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            apiFetch(
              `/api/v1/vehicles?status=AVAILABLE&limit=100&page=${index + 2}`,
            ),
          ),
        );
        const pageData = await Promise.all(
          pageResponses.map((response) => response.json()),
        );
        allVehicles = allVehicles.concat(
          pageData.flatMap((page) => page.vehicles ?? []),
        );
      }

      setVehicles(allVehicles);
      setListings(listingData.listings ?? []);
      setOrganization(orgData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Une erreur est survenue.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refreshAfterFacebook = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refreshAfterFacebook);
    document.addEventListener("visibilitychange", refreshAfterFacebook);
    return () => {
      window.removeEventListener("focus", refreshAfterFacebook);
      document.removeEventListener("visibilitychange", refreshAfterFacebook);
    };
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setExternalUrl("");
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);

  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      if (event.data?.source !== EXTENSION_MESSAGE_SOURCE) return;

      if (event.data.type === "OKAUTO_EXTENSION_READY") {
        setExtensionConnected(true);
      }
      if (event.data.type === "OKAUTO_EXTENSION_RESULT") {
        setLaunchingMarketplace(false);
        if (event.data.success) {
          setMessage(
            "Marketplace est ouvert. Vérifiez l’annonce, puis cliquez sur Publier dans Facebook.",
          );
          setError("");
        } else {
          setError(event.data.error ?? "Marketplace n’a pas pu être ouvert.");
        }
      }
    };

    window.addEventListener("message", handleExtensionMessage);
    window.postMessage(
      { source: APP_MESSAGE_SOURCE, type: "OKAUTO_EXTENSION_PING" },
      window.location.origin,
    );
    const retry = window.setTimeout(() => {
      window.postMessage(
        { source: APP_MESSAGE_SOURCE, type: "OKAUTO_EXTENSION_PING" },
        window.location.origin,
      );
    }, 800);

    return () => {
      window.clearTimeout(retry);
      window.removeEventListener("message", handleExtensionMessage);
    };
  }, []);

  const activeVehicleIds = useMemo(
    () =>
      new Set(
        listings
          .filter((listing) => listing.status === "ACTIVE")
          .map((listing) => listing.vehicle.id),
      ),
    [listings],
  );

  useEffect(() => {
    if (!selected || !activeVehicleIds.has(selected.id)) return;
    setSelected(null);
    setExternalUrl("");
    setQueue("active");
    setMessage(
      "Publication Facebook détectée et enregistrée automatiquement dans Suivia Auto.",
    );
  }, [activeVehicleIds, selected]);

  const readyVehicles = useMemo(
    () => vehicles.filter((vehicle) => !activeVehicleIds.has(vehicle.id)),
    [activeVehicleIds, vehicles],
  );
  const activeListings = listings.filter(
    (listing) => listing.status === "ACTIVE",
  );
  const staleListings = listings.filter(
    (listing) => listing.status === "STALE",
  );
  const historyListings = listings.filter((listing) =>
    ["REMOVED", "SOLD"].includes(listing.status),
  );

  const normalizedSearch = search.trim().toLowerCase();
  const filteredReady = readyVehicles.filter((vehicle) =>
    [vehicleName(vehicle), vehicle.stockNumber, vehicle.vin]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
  );

  const counts: Record<Queue, number> = {
    prepare: readyVehicles.length,
    active: activeListings.length,
    remove: staleListings.length,
    history: historyListings.length,
  };

  const listingPackage = selected
    ? generateMarketplacePackage({
        ...selected,
        dealershipName: organization.name,
        contactName: user?.name || MARKETPLACE_CONTACT_NAME,
        phone: organization.phone ?? undefined,
        location: [organization.address, organization.city, organization.state]
          .filter(Boolean)
          .join(", "),
      })
    : null;
  const marketplaceReady = Boolean(
    listingPackage?.isReady && selected?.photos.length,
  );

  const copyText = async (label: string, value: string) => {
    setError("");
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          copyWithLegacyClipboard(value);
        }
      } else {
        copyWithLegacyClipboard(value);
      }
      setCopied(label);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setError(
        "La copie a été bloquée par le navigateur. Sélectionnez le texte et copiez-le manuellement.",
      );
    }
  };

  const downloadPhotos = async () => {
    if (!selected || selected.photos.length === 0) return;

    setDownloadingPhotos(true);
    setError("");
    setMessage("");
    try {
      for (let index = 0; index < selected.photos.length; index += 1) {
        const response = await apiFetch(
          `/api/v1/vehicles/${selected.id}/photos/download?index=${index}`,
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Impossible de télécharger la photo.");
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const disposition = response.headers.get("content-disposition") ?? "";
        const filename =
          disposition.match(/filename="([^"]+)"/)?.[1] ??
          `${selected.stockNumber ?? selected.id}-photo-${index + 1}.jpg`;
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      }

      setMessage(
        `${selected.photos.length} photo${selected.photos.length > 1 ? "s téléchargées" : " téléchargée"}. Ajoutez-la dans Marketplace.`,
      );
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Impossible de télécharger la photo.",
      );
    } finally {
      setDownloadingPhotos(false);
    }
  };

  const startMarketplace = async () => {
    if (!selected || !listingPackage || !marketplaceReady) return;

    setLaunchingMarketplace(true);
    setError("");
    setMessage("");

    window.postMessage(
      {
        source: APP_MESSAGE_SOURCE,
        type: "OKAUTO_START_MARKETPLACE",
        vehicle: {
          ...selected,
          price: selected.price == null ? null : Number(selected.price),
          contactName: user?.name || MARKETPLACE_CONTACT_NAME,
          dealershipName: organization.name,
          phone: organization.phone ?? undefined,
          description: listingPackage.description,
          photos: selected.photos.map((photo) => photo.url),
        },
      },
      window.location.origin,
    );
    window.setTimeout(() => setLaunchingMarketplace(false), 6000);
  };

  const prepareManualMarketplace = () => {
    if (!selected || !listingPackage || !marketplaceReady) return;

    const packageText = `${listingPackage.title}\n\n${formatCurrency(selected.price)}\n\n${listingPackage.description}`;
    setError("");
    setMessage(
      "Marketplace s’ouvre. La photo est en téléchargement et le contenu est copié.",
    );
    try {
      copyWithLegacyClipboard(packageText);
      setCopied("all");
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      void copyText("all", packageText);
    }
    void downloadPhotos();
  };

  const markPublished = async () => {
    if (!selected || !marketplaceReady) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!isFacebookMarketplaceItemUrl(externalUrl)) {
        throw new Error("Collez l’URL réelle de l’annonce Facebook publiée.");
      }
      const response = await apiFetch("/api/v1/listings", {
        method: "POST",
        body: JSON.stringify({
          vehicleId: selected.id,
          platform: "facebook_marketplace",
          externalUrl,
          priceAtListing:
            selected.price != null ? Number(selected.price) : undefined,
          notes:
            "Préparée et vérifiée dans le Centre de publication Suivia Auto.",
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ?? "Impossible d’enregistrer la publication.",
        );

      setMessage(
        "Publication enregistrée. Suivia Auto suivra maintenant ce véhicule.",
      );
      setSelected(null);
      setExternalUrl("");
      setQueue("active");
      await load();
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "URL invalide.",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmRemoved = async (listing: Listing) => {
    if (
      !window.confirm(
        `Confirmer que l’annonce « ${vehicleName(listing.vehicle)} » a été retirée de Facebook?`,
      )
    ) {
      return;
    }
    setSaving(true);
    const response = await apiFetch(`/api/v1/listings/${listing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "REMOVED" }),
    });
    setSaving(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "Le retrait n’a pas pu être enregistré.");
      return;
    }
    setMessage("Retrait confirmé et ajouté au journal.");
    await load();
  };

  return (
    <div className="min-w-0 space-y-6">
      <header className="relative overflow-hidden rounded-[1.75rem] bg-[#071426] px-5 py-6 text-white shadow-[0_22px_55px_-35px_rgba(7,20,38,0.9)] sm:px-7 sm:py-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-2/5 border-l border-white/10 lg:block">
          <div className="absolute left-12 top-0 h-full w-px bg-white/10" />
          <div className="absolute left-24 top-0 h-full w-px bg-white/5" />
        </div>
        <div className="relative grid gap-7 xl:grid-cols-[1fr_22rem] xl:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#d6b75a]/50 bg-[#d6b75a]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#f1d77f]">
                BuckinghamGM · voie de publication
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs text-slate-300">
                <Radio
                  size={12}
                  className={
                    extensionConnected ? "text-emerald-400" : "text-slate-400"
                  }
                />
                {extensionConnected
                  ? "Assistant connecté"
                  : "Mode rapide sans extension"}
              </span>
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-black leading-[0.98] tracking-[-0.045em] sm:text-5xl">
              Du lot à Marketplace.
              <span className="block text-[#79b7ff]">
                Trois clics, puis c’est en ligne.
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Choisissez un véhicule. Suivia Auto prépare la fiche, ouvre
              Facebook et remplit les champs. Vous vérifiez, puis vous publiez.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                Lot prêt
              </span>
              <Gauge size={18} className="text-[#79b7ff]" />
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-4xl font-black tabular-nums">
                  {formatNumber(counts.prepare)}
                </p>
                <p className="text-xs text-slate-400">véhicules publiables</p>
              </div>
              <Link
                href="/dashboard/inventory"
                className="inline-flex items-center text-sm font-bold text-white hover:text-[#79b7ff]"
              >
                Inventaire <ArrowUpRight className="ml-1.5" size={15} />
              </Link>
            </div>
          </div>
        </div>

        <ol className="relative mt-7 grid gap-2 border-t border-white/10 pt-5 sm:grid-cols-3">
          {[
            ["01", "Choisir l’auto", "Recherchez par stock, NIV ou modèle."],
            [
              "02",
              extensionConnected
                ? "Laisser Suivia Auto remplir"
                : "Préparer automatiquement",
              extensionConnected
                ? "Champs et photo sont envoyés à Facebook."
                : "Contenu copié et photo téléchargée.",
            ],
            [
              "03",
              "Cliquer sur Publier",
              "La confirmation finale reste dans Facebook.",
            ],
          ].map(([number, title, detail]) => (
            <li key={number} className="flex gap-3 rounded-xl px-2 py-2">
              <span className="mt-0.5 font-mono text-xs font-bold text-[#f1d77f]">
                {number}
              </span>
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">
                  {detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </header>

      <div className="rounded-2xl border border-[#b9d5f5] bg-[#edf6ff] px-4 py-3 text-sm text-[#0b315c]">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-[#0b4da2]" size={19} />
          <p className="min-w-0 leading-6">
            <strong>Chaque annonce demeure sous votre contrôle.</strong> Suivia
            Auto prépare tout, mais Facebook vous laisse relire l’annonce avant
            la publication finale. Meta limite la catégorie Véhicules à cinq
            nouvelles annonces par mois.{" "}
            <a
              className="font-bold underline underline-offset-2"
              href="https://www.facebook.com/help/811082570742714"
              target="_blank"
              rel="noreferrer"
            >
              Voir la règle
            </a>
          </p>
        </div>
      </div>

      {(message || error) && (
        <div
          role={error ? "alert" : "status"}
          className={cn(
            "flex items-center justify-between rounded-lg border px-4 py-3 text-sm",
            error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          <span>{error || message}</span>
          <button
            type="button"
            className="rounded p-1 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            onClick={() => {
              setError("");
              setMessage("");
            }}
            aria-label="Fermer le message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <div
          className="flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Files de publication"
        >
          {QUEUES.map((item) => {
            const Icon = item.icon;
            const active = queue === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setQueue(item.id)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors",
                  active
                    ? "bg-[#071426] text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon size={16} />
                {item.label}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    active ? "bg-white/15 text-white" : "bg-slate-100",
                  )}
                >
                  {formatNumber(counts[item.id])}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-xl bg-slate-200"
            />
          ))}
        </div>
      ) : queue === "prepare" ? (
        <section aria-labelledby="prepare-heading">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="prepare-heading"
                className="text-lg font-bold text-slate-950"
              >
                Véhicules prêts à préparer
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Disponibles et sans annonce active enregistrée.
              </p>
            </div>
            <label className="relative block w-full sm:w-80">
              <span className="sr-only">Rechercher un véhicule</span>
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={16}
              />
              <input
                type="search"
                className="input pl-9"
                placeholder="Stock, NIV, marque ou modèle…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          {filteredReady.length === 0 ? (
            <EmptyState
              title="Aucun véhicule dans cette file"
              detail={
                search
                  ? "Essayez un autre terme de recherche."
                  : "Tous les véhicules disponibles ont une annonce active."
              }
            />
          ) : (
            <>
              <div className="grid min-w-0 gap-3">
                {filteredReady.slice(0, 40).map((vehicle) => (
                  <VehicleRow
                    key={vehicle.id}
                    vehicle={vehicle}
                    onPrepare={() => setSelected(vehicle)}
                  />
                ))}
              </div>
              {filteredReady.length > 40 && (
                <p className="mt-4 text-center text-sm text-slate-500">
                  40 résultats affichés sur {formatNumber(filteredReady.length)}
                  . Utilisez la recherche pour trouver un stock précis.
                </p>
              )}
            </>
          )}
        </section>
      ) : (
        <ListingQueue
          queue={queue}
          listings={
            queue === "active"
              ? activeListings
              : queue === "remove"
                ? staleListings
                : historyListings
          }
          saving={saving}
          onConfirmRemoved={confirmRemoved}
        />
      )}

      {selected && listingPackage && (
        <section
          className="fixed inset-0 z-50 !mt-0 overflow-y-auto bg-slate-950/55 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Préparer l’annonce"
        >
          <div className="ml-auto min-h-full w-full max-w-3xl overflow-hidden rounded-[1.75rem] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-[#071426] px-5 py-5 text-white sm:px-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#79b7ff]">
                  Prête au départ
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white">
                  {vehicleName(selected)}
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  Stock {selected.stockNumber ?? "—"} ·{" "}
                  {formatCurrency(selected.price)} ·{" "}
                  {formatNumber(selected.mileage)} km
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79b7ff]"
                onClick={() => {
                  setSelected(null);
                  setExternalUrl("");
                }}
                aria-label="Fermer la fiche"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 p-5 sm:p-7">
              {selected.photos[0] && (
                <img
                  src={selected.photos[0].url}
                  alt={vehicleName(selected)}
                  width={960}
                  height={540}
                  className="aspect-video w-full rounded-xl bg-slate-100 object-cover"
                />
              )}

              {!marketplaceReady && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <p className="font-semibold">Publication bloquée</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {listingPackage.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                    {selected.photos.length === 0 && (
                      <li>Au moins une photo est requise.</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CheckItem ok={selected.price != null} label="Prix affiché" />
                <CheckItem
                  ok={selected.mileage != null}
                  label="Kilométrage affiché"
                />
                <CheckItem
                  ok={Boolean(selected.stockNumber && selected.vin)}
                  label="Stock et NIV"
                />
                <CheckItem
                  ok={selected.photos.length > 0}
                  label={`${Math.min(selected.photos.length, 20)} photo${Math.min(selected.photos.length, 20) > 1 ? "s" : ""} prête${Math.min(selected.photos.length, 20) > 1 ? "s" : ""}`}
                />
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#0b4da2]/20 bg-[#f2f7fc]">
                <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="flex items-center gap-2 text-[#0b4da2]">
                      <Zap size={17} fill="currentColor" />
                      <p className="text-xs font-black uppercase tracking-[0.16em]">
                        {extensionConnected ? "Assistant prêt" : "Mode rapide"}
                      </p>
                    </div>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-[#071426]">
                      {extensionConnected
                        ? "Ouvrir et remplir Facebook"
                        : "Préparer et ouvrir Facebook"}
                    </h3>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                      {extensionConnected
                        ? "Suivia Auto ouvre Marketplace, remplit les champs et ajoute automatiquement jusqu’à 20 photos. Il ne vous reste qu’à vérifier et publier."
                        : "Suivia Auto copie le texte, télécharge la photo et ouvre Marketplace. Ajoutez la photo, collez le contenu, puis publiez."}
                    </p>
                  </div>
                  <a
                    className={cn(
                      "inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-[#0b4da2] px-5 text-sm font-black text-white shadow-[0_12px_24px_-14px_rgba(11,77,162,0.9)] transition hover:bg-[#083d82] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b4da2] focus-visible:ring-offset-2 lg:w-auto",
                      (!marketplaceReady || launchingMarketplace) &&
                        "pointer-events-none opacity-50",
                    )}
                    href={MARKETPLACE_CREATE_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!marketplaceReady || launchingMarketplace}
                    onClick={(event) => {
                      if (!marketplaceReady || launchingMarketplace) {
                        event.preventDefault();
                        return;
                      }
                      if (extensionConnected) {
                        event.preventDefault();
                        void startMarketplace();
                      } else {
                        prepareManualMarketplace();
                      }
                    }}
                  >
                    {launchingMarketplace ? (
                      "Ouverture…"
                    ) : (
                      <>
                        <Facebook
                          size={18}
                          className="mr-2"
                          fill="currentColor"
                        />
                        Publier sur Marketplace
                      </>
                    )}
                  </a>
                </div>
                <div className="grid border-t border-[#0b4da2]/10 bg-white/70 sm:grid-cols-3">
                  {[
                    ["1", "Fiche prête"],
                    [
                      "2",
                      extensionConnected
                        ? "Facebook prérempli"
                        : "Contenu préparé",
                    ],
                    ["3", "Vous confirmez"],
                  ].map(([number, label]) => (
                    <div
                      key={number}
                      className="flex items-center gap-2 border-b border-[#0b4da2]/10 px-4 py-3 text-sm font-bold text-slate-700 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#071426] font-mono text-[11px] text-white">
                        {number}
                      </span>
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <details className="group rounded-2xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-bold text-slate-900 marker:content-none">
                  Voir ou copier le contenu de l’annonce
                  <span className="text-xs font-semibold text-[#0b4da2] group-open:hidden">
                    Afficher
                  </span>
                  <span className="hidden text-xs font-semibold text-[#0b4da2] group-open:inline">
                    Masquer
                  </span>
                </summary>
                <div className="space-y-5 border-t border-slate-200 p-4 sm:p-5">
                  <CopyField
                    label="Titre"
                    value={listingPackage.title}
                    copied={copied === "title"}
                    onCopy={() => copyText("title", listingPackage.title)}
                  />
                  <CopyField
                    label="Prix"
                    value={
                      selected.price != null
                        ? String(Math.round(Number(selected.price)))
                        : ""
                    }
                    copied={copied === "price"}
                    onCopy={() =>
                      copyText(
                        "price",
                        String(Math.round(Number(selected.price))),
                      )
                    }
                  />
                  <CopyField
                    label="Description"
                    value={listingPackage.description}
                    multiline
                    copied={copied === "description"}
                    onCopy={() =>
                      copyText("description", listingPackage.description)
                    }
                  />
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                    <h3 className="font-bold">Champs préparés pour Facebook</h3>
                    <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                      <p>
                        <strong>Type :</strong> Voiture/Camion
                      </p>
                      <p>
                        <strong>Année :</strong> {selected.year ?? "—"}
                      </p>
                      <p>
                        <strong>Marque :</strong> {selected.make ?? "—"}
                      </p>
                      <p>
                        <strong>Modèle :</strong>{" "}
                        {[selected.model, selected.trim]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </p>
                      <p>
                        <strong>Kilométrage :</strong>{" "}
                        {formatNumber(selected.mileage)} km
                      </p>
                      <p>
                        <strong>Photo :</strong>{" "}
                        {extensionConnected
                          ? "ajoutée automatiquement si Facebook l’accepte"
                          : "téléchargée automatiquement"}
                      </p>
                    </div>
                  </div>
                </div>
              </details>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    copyText(
                      "all",
                      `${listingPackage.title}\n\n${formatCurrency(selected.price)}\n\n${listingPackage.description}`,
                    )
                  }
                >
                  {copied === "all" ? <Check size={16} /> : <Copy size={16} />}
                  <span className="ml-2">
                    {copied === "all" ? "Copié" : "Tout copier"}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={downloadPhotos}
                  disabled={downloadingPhotos || selected.photos.length === 0}
                >
                  <Download size={15} className="mr-2" />
                  {downloadingPhotos
                    ? "Téléchargement…"
                    : "Télécharger la photo"}
                </button>
                {selected.sourceUrl && (
                  <a
                    className="btn-secondary"
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Fiche BuckinghamGM{" "}
                    <ExternalLink className="ml-2" size={15} />
                  </a>
                )}
              </div>

              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 sm:p-5">
                <h3 className="font-bold text-slate-950">Suivi automatique</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Avec l’extension, Suivia Auto détecte l’URL finale après votre
                  clic sur Publier et classe automatiquement le véhicule dans «
                  Publiées ». Pour rattacher une annonce déjà en ligne, collez
                  son URL exacte ci-dessous.
                </p>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-sm font-semibold">
                    Rattacher une annonce existante
                  </span>
                  <input
                    type="url"
                    className="input"
                    placeholder="https://www.facebook.com/marketplace/item/…"
                    value={externalUrl}
                    onChange={(event) => setExternalUrl(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary mt-3 w-full sm:w-auto"
                  onClick={markPublished}
                  disabled={saving || !externalUrl || !marketplaceReady}
                >
                  {saving ? "Enregistrement…" : "Rattacher à Suivia Auto"}
                </button>
              </div>

              <p className="text-xs leading-5 text-slate-500">
                Aide à la conformité seulement : validez toujours l’exactitude,
                la disponibilité et les obligations applicables avant de
                publier. N’ajoutez aucun frais obligatoire au prix affiché.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function VehicleRow({
  vehicle,
  onPrepare,
}: {
  vehicle: Vehicle;
  onPrepare: () => void;
}) {
  return (
    <article className="group flex min-w-0 w-full flex-col gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-[#8eb9e8] hover:shadow-md sm:flex-row sm:items-center">
      <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-24 sm:w-36">
        {vehicle.photos[0] ? (
          <img
            src={vehicle.photos[0].url}
            alt=""
            width={224}
            height={160}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Sans photo
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 px-1">
        <span className="inline-flex rounded-md bg-[#edf6ff] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-[#0b4da2]">
          Stock {vehicle.stockNumber ?? "—"}
        </span>
        <h3 className="mt-2 truncate text-base font-black tracking-tight text-[#071426]">
          {vehicleName(vehicle)}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {formatNumber(vehicle.mileage)} km · Synchronisé{" "}
          {formatDateTime(vehicle.updatedAt)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-1 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <p className="text-lg font-black tabular-nums text-[#071426]">
          {formatCurrency(vehicle.price)}
        </p>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#0b4da2] px-4 text-sm font-black text-white transition hover:bg-[#083d82] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b4da2] focus-visible:ring-offset-2"
          onClick={onPrepare}
        >
          <MousePointerClick size={16} className="mr-2" /> Publier
        </button>
      </div>
    </article>
  );
}

function ListingQueue({
  queue,
  listings,
  saving,
  onConfirmRemoved,
}: {
  queue: Queue;
  listings: Listing[];
  saving: boolean;
  onConfirmRemoved: (listing: Listing) => void;
}) {
  const copy = {
    active: {
      title: "Annonces publiées",
      detail: "URLs enregistrées et reliées à l’inventaire.",
      empty: "Aucune annonce active enregistrée.",
    },
    remove: {
      title: "Retraits à confirmer",
      detail: "Retirez d’abord l’annonce sur Facebook, puis confirmez ici.",
      empty: "Aucun retrait en attente. Le lot est aligné.",
    },
    history: {
      title: "Historique",
      detail: "Annonces vendues ou retirées, conservées pour le suivi.",
      empty: "Aucune annonce archivée.",
    },
  }[queue as "active" | "remove" | "history"];

  return (
    <section aria-labelledby={`${queue}-heading`}>
      <h2 id={`${queue}-heading`} className="text-lg font-bold text-slate-950">
        {copy.title}
      </h2>
      <p className="mb-4 mt-1 text-sm text-slate-500">{copy.detail}</p>
      {listings.length === 0 ? (
        <EmptyState
          title={copy.empty}
          detail="Les changements apparaîtront automatiquement dans cette file."
        />
      ) : (
        <div className="grid min-w-0 gap-3">
          {listings.map((listing) => (
            <article
              key={listing.id}
              className="card flex min-w-0 w-full flex-col gap-4 p-4 sm:flex-row sm:items-center"
            >
              <div className="h-20 w-full shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:w-28">
                {listing.vehicle.photos[0] && (
                  <img
                    src={listing.vehicle.photos[0].url}
                    alt=""
                    width={224}
                    height={160}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-950">
                  {vehicleName(listing.vehicle)}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Stock {listing.vehicle.stockNumber ?? "—"} · Publiée par{" "}
                  {listing.user.name} · {formatDateTime(listing.listedAt)}
                </p>
                {queue === "remove" && (
                  <p className="mt-2 text-sm font-semibold text-amber-800">
                    Action requise : retirer sur Facebook.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <p className="mr-2 font-bold tabular-nums">
                  {formatCurrency(listing.priceAtListing)}
                </p>
                {listing.externalUrl && (
                  <a
                    className="btn-secondary"
                    href={listing.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Voir <ExternalLink className="ml-2" size={14} />
                  </a>
                )}
                {queue === "remove" && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onConfirmRemoved(listing)}
                    disabled={saving}
                  >
                    Confirmer le retrait
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CopyField({
  label,
  value,
  multiline = false,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-bold text-slate-900">{label}</label>
        <button
          type="button"
          className="btn-secondary px-3 py-1.5"
          onClick={onCopy}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span className="ml-1.5">{copied ? "Copié" : "Copier"}</span>
        </button>
      </div>
      {multiline ? (
        <textarea
          className="input min-h-72 resize-y bg-white leading-6"
          readOnly
          value={value}
        />
      ) : (
        <input className="input bg-white" readOnly value={value} />
      )}
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {label}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <CheckCircle2 className="mx-auto text-slate-300" size={30} />
      <p className="mt-3 font-bold text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}
