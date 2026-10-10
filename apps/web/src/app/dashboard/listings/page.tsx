"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  Facebook,
  Gauge,
  History,
  MousePointerClick,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Save,
  Sparkles,
  Zap,
  X,
} from "lucide-react";
import {
  generateMarketplacePackage,
  isFacebookMarketplaceItemUrl,
  isListingDueForRenewal,
  listingNeedsMarketplaceRemoval,
  carfaxSourceUrlCheckboxState,
  listingDescriptionMeetsMinLength,
  listingDescriptionWithCarfax,
  listingEditorDescription,
  MIN_LISTING_DESCRIPTION_LENGTH,
  resolveIncludeCarfaxSourceUrl,
  type ListingLocale,
  type VehicleData,
} from "@okauto/shared";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { CockpitSkeleton } from "@/components/cockpit-skeleton";
import { FadeIn } from "@/components/fade-in";
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
  feedAbsenceStatus?: string | null;
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
  includeCarfaxSourceUrl?: boolean;
  features: string[];
  updatedAt: string;
  photos: Array<{ url: string; isPrimary: boolean }>;
  listings: Array<{ id: string; status: string }>;
  marketplaceDrafts?: Array<{
    id?: string;
    title: string;
    description: string;
    photoOrder: string[];
    updatedAt?: string;
  }>;
}

interface DraftEdit {
  vehicleId: string;
  title: string;
  description: string;
}

interface Listing {
  id: string;
  status: "ACTIVE" | "STALE" | "REMOVED" | "SOLD" | "DRAFT";
  listedAt: string;
  lastRenewedAt?: string | null;
  removedAt: string | null;
  priceAtListing: number | null;
  marketplacePrice?: number | null;
  externalUrl: string | null;
  staleSince?: string | null;
  hoursStale?: number | null;
  health?: {
    priceMismatch: { from: number; to: number; direction: "up" | "down" } | null;
    renewDue: boolean;
    daysSinceFreshness: number;
  };
  vehicle: Vehicle;
  user: { name: string };
}

interface TodaySuggestion {
  vehicle: Vehicle & { photoUrl?: string | null; managerPriority?: boolean };
  score: number;
  reasons: string[];
  alreadyListedBy: Array<{ name: string }>;
}

interface Organization {
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  listingLocale?: string | null;
  listingLanguage?: string | null;
  listingRenewalDays?: number | null;
  monthlyListingLimit?: number | null;
  marketplaceMonthlyVehicleLimit?: number | null;
  allInPriceConfirmedAt?: string | null;
  freightFee?: number | string | null;
  pdiFee?: number | string | null;
  adminFee?: number | string | null;
  acExciseFee?: number | string | null;
  includeCarfaxSourceUrl?: boolean;
}

type Queue = "today" | "prepare" | "active" | "remove" | "renew" | "history";
type InventoryType = "" | "NEW" | "USED" | "DEMO";

const MARKETPLACE_CREATE_URL =
  "https://www.facebook.com/marketplace/create/vehicle";
const MARKETPLACE_CONTACT_NAME =
  process.env.NEXT_PUBLIC_MARKETPLACE_CONTACT_NAME?.trim() || "Michael Boyer";
const APP_MESSAGE_SOURCE = "okauto-web";

function marketplaceListingVehicle(
  vehicle: Vehicle,
  organization: Organization,
  contactName: string,
  locale: ListingLocale,
): VehicleData {
  return {
    ...vehicle,
    dealershipName: organization.name,
    contactName,
    phone: organization.phone ?? undefined,
    location: [organization.address, organization.city, organization.state]
      .filter(Boolean)
      .join(", "),
    includeCarfaxSourceUrl: resolveIncludeCarfaxSourceUrl(
      organization.includeCarfaxSourceUrl,
      vehicle.includeCarfaxSourceUrl,
    ),
    language: locale === "bilingual" ? "fr_en" : "fr",
  };
}
const EXTENSION_MESSAGE_SOURCE = "okauto-extension";

const QUEUES: Array<{ id: Queue; label: string; icon: typeof Clipboard }> = [
  { id: "today", label: "Aujourd’hui", icon: Zap },
  { id: "prepare", label: "À préparer", icon: Clipboard },
  { id: "active", label: "Publiées", icon: CheckCircle2 },
  { id: "renew", label: "À renouveler", icon: RefreshCw },
  { id: "remove", label: "À retirer", icon: AlertTriangle },
  { id: "history", label: "Historique", icon: History },
];
const MARKETPLACE_YOUR_LISTINGS_URL = "https://www.facebook.com/marketplace/";

const INVENTORY_TYPES: Array<{ id: InventoryType; label: string }> = [
  { id: "", label: "Tous" },
  { id: "NEW", label: "Neufs" },
  { id: "USED", label: "Occasion" },
  { id: "DEMO", label: "Démonstrateurs" },
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
      <Suspense
        fallback={<CockpitSkeleton rows={2} />}
      >
        <ListingsContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ListingsContent() {
  const { apiFetch, user } = useAuth();
  const searchParams = useSearchParams();
  const prepareId = searchParams.get("prepare");
  const queueParam = searchParams.get("queue");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [readyTotal, setReadyTotal] = useState(0);
  const [allReadyTotal, setAllReadyTotal] = useState(0);
  const [listings, setListings] = useState<Listing[]>([]);
  const [orgListingsToRemove, setOrgListingsToRemove] = useState<
    Array<{
      id: string;
      externalUrl: string | null;
      user?: { name: string } | null;
      vehicle: Vehicle;
    }>
  >([]);
  const [listingCounts, setListingCounts] = useState<Record<string, number>>(
    {},
  );
  const [organization, setOrganization] = useState<Organization>({
    name: "Votre concession",
  });
  const [draftLocale, setDraftLocale] = useState<ListingLocale>("fr");
  const [quota, setQuota] = useState<{
    usedThisMonth: number;
    remainingThisMonth: number;
    monthlyLimit: number;
    resetsAt?: string;
  } | null>(null);
  const [todaySuggestions, setTodaySuggestions] = useState<TodaySuggestion[]>(
    [],
  );
  const [activeHealthFilter, setActiveHealthFilter] = useState<
    "all" | "price" | "renew"
  >("all");
  const [queue, setQueue] = useState<Queue>(
    queueParam === "remove" ? "remove" : "today",
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [inventoryType, setInventoryType] = useState<InventoryType>("");
  const [readyPage, setReadyPage] = useState(1);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [preparingVehicleId, setPreparingVehicleId] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [downloadingPhotos, setDownloadingPhotos] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftEdit, setDraftEdit] = useState<DraftEdit | null>(null);
  const [savedDraft, setSavedDraft] = useState<DraftEdit | null>(null);
  const [launchingMarketplace, setLaunchingMarketplace] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const lastListingRefresh = useRef(0);
  const searchInitialized = useRef(false);
  const readyRequestId = useRef(0);

  const load = useCallback(
    async (searchTerm = "", initial = false) => {
      if (initial) setLoading(true);
      else setRefreshing(true);
      setError("");
      try {
        const vehicleParams = new URLSearchParams({
          status: "AVAILABLE",
          withoutActiveListing: "true",
          view: "summary",
          limit: "40",
          page: "1",
        });
        if (searchTerm) vehicleParams.set("search", searchTerm);

        const [vehicleResponse, listingResponse, orgResponse, queueResponse, todayResponse] =
          await Promise.all([
            apiFetch(`/api/v1/vehicles?${vehicleParams}`),
            apiFetch("/api/v1/listings?limit=250&page=1"),
            apiFetch("/api/v1/organizations/current"),
            apiFetch("/api/v1/analytics/publish-queue"),
            apiFetch("/api/v1/listings/today"),
          ]);

        if (!vehicleResponse.ok || !listingResponse.ok || !orgResponse.ok) {
          throw new Error("Impossible de charger le centre de publication.");
        }

        const [vehicleData, listingData, orgData, queueData, todayData] =
          await Promise.all([
          vehicleResponse.json(),
          listingResponse.json(),
          orgResponse.json(),
          queueResponse.ok ? queueResponse.json() : Promise.resolve(null),
          todayResponse.ok ? todayResponse.json() : Promise.resolve(null),
        ]);

        setVehicles(vehicleData.vehicles ?? []);
        setReadyTotal(vehicleData.pagination?.total ?? 0);
        setAllReadyTotal(vehicleData.pagination?.total ?? 0);
        setReadyPage(1);
        setListings(listingData.listings ?? []);
        setOrgListingsToRemove(listingData.listingsToRemove ?? []);
        setListingCounts(listingData.counts ?? {});
        setOrganization(orgData);
        setDraftLocale(
          orgData.listingLanguage === "fr_en" ||
            orgData.listingLocale === "bilingual"
            ? "bilingual"
            : orgData.listingLocale === "en"
              ? "en"
              : "fr",
        );
        if (todayData?.quota) {
          setQuota({
            usedThisMonth: todayData.quota.used,
            remainingThisMonth: todayData.quota.remaining,
            monthlyLimit: todayData.quota.limit,
            resetsAt: todayData.quota.resetsAt,
          });
          setTodaySuggestions(todayData.suggestions ?? []);
        } else if (queueData) {
          setQuota({
            usedThisMonth: queueData.usedThisMonth,
            remainingThisMonth: queueData.remainingThisMonth,
            monthlyLimit: queueData.monthlyLimit,
          });
        }
        lastListingRefresh.current = Date.now();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Une erreur est survenue.",
        );
      } finally {
        if (initial) setLoading(false);
        setRefreshing(false);
      }
    },
    [apiFetch],
  );

  const loadReadyVehicles = useCallback(
    async (
      searchTerm: string,
      type: InventoryType,
      page = 1,
      append = false,
    ) => {
      const requestId = readyRequestId.current + 1;
      readyRequestId.current = requestId;
      if (append) setLoadingMore(true);
      else setRefreshing(true);
      setError("");
      try {
        const params = new URLSearchParams({
          status: "AVAILABLE",
          withoutActiveListing: "true",
          view: "summary",
          limit: "40",
          page: String(page),
        });
        if (searchTerm) params.set("search", searchTerm);
        if (type) params.set("inventoryType", type);
        const response = await apiFetch(`/api/v1/vehicles?${params}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            data.error ?? "La recherche n’a pas pu être chargée.",
          );
        }
        if (requestId !== readyRequestId.current) return;
        const nextVehicles = (data.vehicles ?? []) as Vehicle[];
        setVehicles((current) => {
          if (!append) return nextVehicles;
          const existingIds = new Set(current.map((vehicle) => vehicle.id));
          return [
            ...current,
            ...nextVehicles.filter((vehicle) => !existingIds.has(vehicle.id)),
          ];
        });
        setReadyTotal(data.pagination?.total ?? 0);
        if (!searchTerm && !type) {
          setAllReadyTotal(data.pagination?.total ?? 0);
        }
        setReadyPage(page);
      } catch (searchError) {
        setError(
          searchError instanceof Error
            ? searchError.message
            : "La recherche n’a pas pu être chargée.",
        );
      } finally {
        if (requestId === readyRequestId.current) {
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    void load("", true);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (loading) return;
    if (!searchInitialized.current) {
      searchInitialized.current = true;
      return;
    }
    void loadReadyVehicles(debouncedSearch, inventoryType);
  }, [debouncedSearch, inventoryType, loadReadyVehicles, loading]);

  const refreshListings = useCallback(
    async (force = false) => {
      if (!force && Date.now() - lastListingRefresh.current < 15_000) return;
      const response = await apiFetch("/api/v1/listings?limit=250&page=1");
      if (!response.ok) return;
      const data = await response.json();
      setListings(data.listings ?? []);
      setOrgListingsToRemove(data.listingsToRemove ?? []);
      setListingCounts(data.counts ?? {});
      lastListingRefresh.current = Date.now();
    },
    [apiFetch],
  );

  useEffect(() => {
    const refreshAfterFacebook = () => {
      if (document.visibilityState === "visible") void refreshListings();
    };
    window.addEventListener("focus", refreshAfterFacebook);
    document.addEventListener("visibilitychange", refreshAfterFacebook);
    return () => {
      window.removeEventListener("focus", refreshAfterFacebook);
      document.removeEventListener("visibilitychange", refreshAfterFacebook);
    };
  }, [refreshListings]);

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
    setVehicles((current) =>
      current.filter((vehicle) => vehicle.id !== selected.id),
    );
    setReadyTotal((current) => Math.max(0, current - 1));
    setAllReadyTotal((current) => Math.max(0, current - 1));
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
    (listing) =>
      listing.status === "ACTIVE" && !listingNeedsMarketplaceRemoval(listing),
  );
  const staleListings = listings.filter(
    (listing) => listing.status === "STALE",
  );
  const listingsToRemove = listings.filter((listing) =>
    listingNeedsMarketplaceRemoval(listing),
  );
  const alertListingsToRemove =
    orgListingsToRemove.length > 0 ? orgListingsToRemove : listingsToRemove;
  const removalListings = [...listingsToRemove, ...staleListings];
  const historyListings = listings.filter((listing) =>
    ["REMOVED", "SOLD"].includes(listing.status),
  );
  const renewalDays = organization.listingRenewalDays ?? 7;
  const renewListings = activeListings.filter(
    (listing) =>
      listing.health?.renewDue ??
      isListingDueForRenewal(
        listing.listedAt,
        listing.lastRenewedAt,
        renewalDays,
      ),
  );
  const priceMismatchListings = activeListings.filter(
    (listing) => listing.health?.priceMismatch,
  );

  const normalizedSearch = search.trim().toLowerCase();
  const filteredReady = readyVehicles.filter((vehicle) =>
    [vehicleName(vehicle), vehicle.stockNumber, vehicle.vin]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
  );
  const selectedReadyIndex = selected
    ? filteredReady.findIndex((vehicle) => vehicle.id === selected.id)
    : -1;
  const nextReadyVehicle =
    selectedReadyIndex >= 0
      ? (filteredReady[selectedReadyIndex + 1] ?? null)
      : (filteredReady[0] ?? null);

  const counts: Record<Queue, number> = {
    today: todaySuggestions.length,
    prepare: allReadyTotal,
    active: listingCounts.ACTIVE ?? activeListings.length,
    renew:
      listingCounts.RENEW_DUE ??
      activeListings.filter((listing) => listing.health?.renewDue).length,
    remove: removalListings.length,
    history:
      (listingCounts.REMOVED ?? 0) + (listingCounts.SOLD ?? 0) ||
      historyListings.length,
  };

  const listingPackage = useMemo(() => {
    if (!selected) return null;
    const generated = generateMarketplacePackage(
      {
        ...selected,
        dealershipName: organization.name,
        contactName: user?.name || MARKETPLACE_CONTACT_NAME,
        phone: organization.phone ?? undefined,
        location: [organization.address, organization.city, organization.state]
          .filter(Boolean)
          .join(", "),
        organizationFees: {
          freightFee: Number(organization.freightFee ?? 0),
          pdiFee: Number(organization.pdiFee ?? 0),
          adminFee: Number(organization.adminFee ?? 0),
          acExciseFee: Number(organization.acExciseFee ?? 0),
        },
        allInPriceConfirmed: Boolean(organization.allInPriceConfirmedAt),
        language: draftLocale === "bilingual" ? "fr_en" : "fr",
        includeCarfaxSourceUrl: resolveIncludeCarfaxSourceUrl(
          organization.includeCarfaxSourceUrl,
          selected.includeCarfaxSourceUrl,
        ),
      },
      draftLocale,
    );
    const draft = selected.marketplaceDrafts?.[0];
    const activeEdit =
      draftEdit?.vehicleId === selected.id ? draftEdit : undefined;
    return {
      ...generated,
      title: activeEdit ? activeEdit.title : draft?.title || generated.title,
      description: listingEditorDescription(
        activeEdit?.description,
        draft?.description,
        generated.description,
      ),
    };
  }, [draftEdit, draftLocale, organization, selected, user?.name]);
  const descriptionForCopyOrSave = (raw: string) => {
    if (!selected) return raw;
    return listingDescriptionWithCarfax(
      raw,
      marketplaceListingVehicle(
        selected,
        organization,
        user?.name || MARKETPLACE_CONTACT_NAME,
        draftLocale,
      ),
      draftLocale,
    );
  };
  const carfaxLinkCheckbox = carfaxSourceUrlCheckboxState(
    organization.includeCarfaxSourceUrl,
    selected?.includeCarfaxSourceUrl,
  );
  const draftDirty = Boolean(
    selected &&
    draftEdit?.vehicleId === selected.id &&
    savedDraft?.vehicleId === selected.id &&
    (draftEdit.title !== savedDraft.title ||
      draftEdit.description !== savedDraft.description),
  );
  const draftContentReady = Boolean(
    listingPackage &&
    listingPackage.title.trim().length >= 5 &&
    listingDescriptionMeetsMinLength(listingPackage.description),
  );
  const marketplaceReady = Boolean(
    listingPackage?.isReady &&
    selected?.photos.length &&
    draftContentReady &&
    !draftDirty,
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

  const prepareVehicle = async (vehicleId: string) => {
    setPreparingVehicleId(vehicleId);
    setError("");
    try {
      const response = await apiFetch(`/api/v1/vehicles/${vehicleId}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Impossible de préparer ce véhicule.");
      }
      const vehicle = data as Vehicle;
      const generated = generateMarketplacePackage(
        {
          ...vehicle,
          dealershipName: organization.name,
          contactName: user?.name || MARKETPLACE_CONTACT_NAME,
          phone: organization.phone ?? undefined,
          location: [
            organization.address,
            organization.city,
            organization.state,
          ]
            .filter(Boolean)
            .join(", "),
          organizationFees: {
            freightFee: Number(organization.freightFee ?? 0),
            pdiFee: Number(organization.pdiFee ?? 0),
            adminFee: Number(organization.adminFee ?? 0),
            acExciseFee: Number(organization.acExciseFee ?? 0),
          },
          allInPriceConfirmed: Boolean(organization.allInPriceConfirmedAt),
          language: draftLocale === "bilingual" ? "fr_en" : "fr",
          includeCarfaxSourceUrl: resolveIncludeCarfaxSourceUrl(
            organization.includeCarfaxSourceUrl,
            vehicle.includeCarfaxSourceUrl,
          ),
        },
        draftLocale,
      );
      const personalDraft = vehicle.marketplaceDrafts?.[0];
      const initialDraft = {
        vehicleId: vehicle.id,
        title: personalDraft?.title || generated.title,
        description: listingEditorDescription(
          undefined,
          personalDraft?.description,
          generated.description,
        ),
      };
      setDraftEdit(initialDraft);
      setSavedDraft(initialDraft);
      setSelected(vehicle);
    } catch (prepareError) {
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : "Impossible de préparer ce véhicule.",
      );
    } finally {
      setPreparingVehicleId(null);
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

  const improveDescription = async () => {
    if (!selected) return;
    setGeneratingDescription(true);
    setError("");
    try {
      const response = await apiFetch(
        `/api/v1/vehicles/${selected.id}/generate-description`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.draft) {
        throw new Error(
          data.error ?? "La description n’a pas pu être améliorée.",
        );
      }
      setSelected((current) =>
        current ? { ...current, marketplaceDrafts: [data.draft] } : current,
      );
      const generatedDraft = {
        vehicleId: selected.id,
        title: data.draft.title,
        description: data.draft.description,
      };
      setDraftEdit(generatedDraft);
      setSavedDraft(generatedDraft);
      setMessage(
        "Description personnalisée créée pour votre profil. Elle sera utilisée par l’extension.",
      );
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "La description n’a pas pu être améliorée.",
      );
    } finally {
      setGeneratingDescription(false);
    }
  };

  const saveMarketplaceDraft = async (advanceToNext = false) => {
    if (!selected || !draftEdit || draftEdit.vehicleId !== selected.id) return;
    const title = draftEdit.title.trim();
    const rawDescription = draftEdit.description.trim();
    if (title.length < 5) {
      setError("Le titre doit contenir au moins 5 caractères.");
      return;
    }
    if (!listingDescriptionMeetsMinLength(rawDescription)) {
      setError(
        `La description doit contenir au moins ${MIN_LISTING_DESCRIPTION_LENGTH} caractères.`,
      );
      return;
    }
    const description = listingDescriptionWithCarfax(
      rawDescription,
      marketplaceListingVehicle(
        selected,
        organization,
        user?.name || MARKETPLACE_CONTACT_NAME,
        draftLocale,
      ),
      draftLocale,
    );

    setSavingDraft(true);
    setError("");
    try {
      const response = await apiFetch(
        `/api/v1/vehicles/${selected.id}/marketplace-draft`,
        {
          method: "PUT",
          body: JSON.stringify({
            title,
            description,
            photoOrder: selected.photos.map((photo) => photo.url).slice(0, 20),
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.draft) {
        throw new Error(
          data.error ?? "Le brouillon n’a pas pu être enregistré.",
        );
      }

      const saved = { vehicleId: selected.id, title, description };
      setDraftEdit(saved);
      setSavedDraft(saved);
      setSelected((current) =>
        current ? { ...current, marketplaceDrafts: [data.draft] } : current,
      );

      if (advanceToNext && nextReadyVehicle) {
        setMessage("Brouillon enregistré. Véhicule suivant chargé.");
        await prepareVehicle(nextReadyVehicle.id);
      } else {
        setMessage(
          "Brouillon enregistré pour votre profil et prêt pour l’extension.",
        );
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Le brouillon n’a pas pu être enregistré.",
      );
    } finally {
      setSavingDraft(false);
    }
  };

  const startMarketplace = async () => {
    if (!selected || !listingPackage || !marketplaceReady) return;
    if (quota && quota.remainingThisMonth <= 0) {
      const proceed = window.confirm(
        `Selon Suivia, vous avez déjà ${quota.usedThisMonth} annonce(s) Véhicules ce mois-ci. Facebook pourrait refuser la publication. Ouvrir Marketplace quand même?`,
      );
      if (!proceed) return;
    }

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
          description: descriptionForCopyOrSave(listingPackage.description),
          title: listingPackage.title,
          photos: selected.photos.map((photo) => photo.url),
        },
      },
      window.location.origin,
    );
    window.setTimeout(() => setLaunchingMarketplace(false), 6000);
  };

  const prepareManualMarketplace = () => {
    if (!selected || !listingPackage || !marketplaceReady) return;

    const packageText = `${listingPackage.title}\n\n${formatCurrency(selected.price)}\n\n${descriptionForCopyOrSave(listingPackage.description)}`;
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
      await Promise.all([
        loadReadyVehicles(debouncedSearch, inventoryType),
        refreshListings(true),
      ]);
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
    await refreshListings(true);
  };

  const confirmRenewed = async (listing: Listing) => {
    setSaving(true);
    const response = await apiFetch(
      `/api/v1/listings/${listing.id}/confirm-renewal`,
      { method: "POST" },
    );
    setSaving(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "Le renouvellement n’a pas pu être enregistré.");
      return;
    }
    setMessage("Renouvellement enregistré. Prochain rappel dans 7 jours.");
    await refreshListings(true);
  };

  const confirmPriceUpdated = async (listing: Listing) => {
    const price = Number(listing.vehicle.price);
    setSaving(true);
    const response = await apiFetch(
      `/api/v1/listings/${listing.id}/confirm-price`,
      { method: "POST", body: JSON.stringify({ price }) },
    );
    setSaving(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "Le prix n’a pas pu être confirmé.");
      return;
    }
    setMessage("Prix confirmé sur Marketplace.");
    await refreshListings(true);
  };

  useEffect(() => {
    if (!prepareId || loading) return;
    void prepareVehicle(prepareId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepareId, loading]);

  return (
    <>
    <FadeIn className="min-w-0 space-y-4">
      <header className="cockpit-scan relative overflow-hidden rounded-2xl border border-sidebar-accent/20 bg-sidebar px-5 py-4 text-sidebar-foreground shadow-[0_0_40px_hsl(var(--sidebar-accent)/0.08)] sm:px-6 sm:py-5">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-2/5 border-l border-white/10 lg:block">
          <div className="absolute left-12 top-0 h-full w-px bg-card/10" />
          <div className="absolute left-24 top-0 h-full w-px bg-card/5" />
        </div>
        <div className="relative grid gap-4 lg:grid-cols-[1fr_18rem] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sidebar-accent/50 bg-sidebar-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-sidebar-accent">
                {organization.name} · voie de publication
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs text-sidebar-foreground/70">
                <Radio
                  size={12}
                  className={
                    extensionConnected
                      ? "text-signal shadow-[0_0_10px_hsl(var(--signal))]"
                      : "text-sidebar-foreground/50"
                  }
                />
                {extensionConnected
                  ? "Assistant connecté"
                  : "Mode rapide sans extension"}
              </span>
            </div>
            <h1 className="mt-3 max-w-3xl text-2xl font-black leading-tight tracking-[-0.035em] sm:text-3xl">
              Centre de publication Marketplace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-sidebar-foreground/70">
              Choisissez une auto, laissez Suivia remplir l’annonce, puis
              vérifiez et publiez dans Facebook.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-card/[0.06] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-sidebar-accent">
                Lot prêt
              </span>
              <Gauge size={18} className="text-sidebar-accent" />
            </div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-3xl font-black tabular-nums">
                  {formatNumber(counts.prepare)}
                </p>
                <p className="text-xs text-sidebar-foreground/60">
                  véhicules publiables
                </p>
              </div>
              <Link
                href="/dashboard/inventory"
                className="inline-flex items-center text-sm font-bold text-sidebar-foreground hover:text-sidebar-accent"
              >
                Inventaire <ArrowUpRight className="ml-1.5" size={15} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {alertListingsToRemove.length > 0 && (
        <section
          className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3"
          aria-labelledby="annonce-a-retirer-heading"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <h2 id="annonce-a-retirer-heading" className="font-bold">
                Annonce à retirer
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatNumber(alertListingsToRemove.length)} annonce
                {alertListingsToRemove.length > 1 ? "s" : ""} encore active
                {alertListingsToRemove.length > 1 ? "s" : ""} pour un véhicule vendu
                ou absent du flux.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {alertListingsToRemove.map((listing) => (
                  <li
                    key={listing.id}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <span>
                      {vehicleName(listing.vehicle)}
                      {listing.vehicle.stockNumber
                        ? ` · ${listing.vehicle.stockNumber}`
                        : ""}
                      {"user" in listing && listing.user?.name
                        ? ` · ${listing.user.name}`
                        : ""}
                    </span>
                    {listing.externalUrl ? (
                      <a
                        href={listing.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-primary hover:underline"
                      >
                        Ouvrir l’annonce
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="font-semibold text-primary hover:underline"
                        onClick={() => setQueue("remove")}
                      >
                        Voir le retrait
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={19} />
          <div className="min-w-0 leading-6">
            {quota && quota.remainingThisMonth <= 0 ? (
              <p>
                <strong>Limite du mois atteinte.</strong> Concentrez-vous sur
                les annonces déjà en ligne : prix à jour, renouvellement et
                retraits.
              </p>
            ) : (
              <p>
                <strong>
                  Il vous reste {quota?.remainingThisMonth ?? "—"} nouvelle(s)
                  annonce(s) Véhicules ce mois-ci
                </strong>{" "}
                (limite indiquée : {quota?.monthlyLimit ?? "configurable"}).
                {quota?.resetsAt
                  ? ` Remise à zéro le ${new Date(quota.resetsAt).toLocaleDateString("fr-CA", { timeZone: "America/Toronto" })}.`
                  : null}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Compté par Suivia à partir de vos publications enregistrées. Les
              annonces supprimées peuvent aussi compter pour Meta. Fiez-vous à
              la limite affichée dans votre compte Facebook. Ne supprimez pas
              une annonce pour la republier.
            </p>
          </div>
        </div>
      </div>

      {(message || error) && (
        <div
          role={error ? "alert" : "status"}
          className={cn(
            "flex items-center justify-between rounded-lg border px-4 py-3 text-sm",
            error
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-signal/30 bg-signal/10 text-signal",
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

      <div className="cockpit-panel p-1.5">
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
                    ? "bg-sidebar text-sidebar-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon size={16} />
                {item.label}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    active ? "bg-white/15 text-white" : "bg-muted",
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
        <CockpitSkeleton rows={4} />
      ) : queue === "today" ? (
        <section aria-labelledby="today-heading">
          <h2 id="today-heading" className="text-lg font-bold text-foreground">
            File du jour
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Priorisés selon l’âge en stock, la priorité du directeur et les
            baisses de prix. Âge calculé depuis l’arrivée du véhicule dans
            Suivia. Évitez une deuxième annonce pour un véhicule déjà en ligne
            chez un collègue.
          </p>
          {todaySuggestions.length === 0 ? (
            <EmptyState
              title="Aucun véhicule à suggérer"
              detail="Vérifiez le quota, les prix et les photos, ou passez à À préparer."
            />
          ) : (
            <div className="grid min-w-0 gap-3">
              {todaySuggestions.map((item, index) => (
                <article
                  key={item.vehicle.id}
                  className="card flex min-w-0 w-full flex-col gap-4 p-4 sm:flex-row sm:items-center"
                >
                  <div className="h-20 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-28">
                    {item.vehicle.photoUrl || item.vehicle.photos?.[0]?.url ? (
                      <img
                        src={item.vehicle.photoUrl || item.vehicle.photos[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">
                      Priorité n° {index + 1}
                    </p>
                    <h3 className="font-bold text-foreground">
                      {vehicleName(item.vehicle)}
                    </h3>
                    <ul className="mt-1 text-sm text-muted-foreground">
                      {item.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                    {item.alreadyListedBy.length > 0 && (
                      <p className="mt-2 text-sm font-semibold text-warning">
                        Déjà en ligne chez{" "}
                        {item.alreadyListedBy.map((person) => person.name).join(", ")}{" "}
                        : évitez une deuxième annonce pour le même véhicule.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void prepareVehicle(item.vehicle.id)}
                    disabled={preparingVehicleId === item.vehicle.id}
                  >
                    Préparer l’annonce
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : queue === "prepare" ? (
        <section aria-labelledby="prepare-heading">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="prepare-heading"
                  className="text-lg font-bold text-foreground"
                >
                  Véhicules prêts à préparer
                </h2>
                {refreshing && (
                  <RefreshCw
                    size={14}
                    className="animate-spin text-primary"
                    aria-label="Mise à jour des résultats"
                  />
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
                {formatNumber(readyTotal)} disponibles sans annonce active.
              </p>
            </div>
            <label className="relative block w-full sm:w-80">
              <span className="sr-only">Rechercher un véhicule</span>
              <Search
                className="absolute left-3 top-3 text-muted-foreground"
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

          <div
            className="cockpit-panel mb-4 flex gap-1 overflow-x-auto p-1.5"
            role="group"
            aria-label="Type d’inventaire"
          >
            {INVENTORY_TYPES.map((type) => (
              <button
                key={type.id || "all"}
                type="button"
                aria-pressed={inventoryType === type.id}
                onClick={() => setInventoryType(type.id)}
                className={cn(
                  "min-h-10 shrink-0 rounded-xl px-3 text-sm font-bold transition-colors",
                  inventoryType === type.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {type.label}
              </button>
            ))}
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
                {filteredReady.map((vehicle) => (
                  <VehicleRow
                    key={vehicle.id}
                    vehicle={vehicle}
                    preparing={preparingVehicleId === vehicle.id}
                    onPrepare={() => void prepareVehicle(vehicle.id)}
                  />
                ))}
              </div>
              {vehicles.length < readyTotal && (
                <div className="cockpit-panel mt-5 p-4 text-center">
                  <p
                    className="text-sm font-semibold text-foreground"
                    aria-live="polite"
                  >
                    {formatNumber(vehicles.length)} affichés sur{" "}
                    {formatNumber(readyTotal)}
                  </p>
                  <div className="mx-auto mt-3 h-1.5 max-w-md overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                      style={{
                        width: `${Math.min(100, (vehicles.length / readyTotal) * 100)}%`,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-primary mt-4 min-h-11"
                    onClick={() =>
                      void loadReadyVehicles(
                        debouncedSearch,
                        inventoryType,
                        readyPage + 1,
                        true,
                      )
                    }
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <RefreshCw size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Download size={16} className="mr-2" />
                    )}
                    {loadingMore
                      ? "Chargement…"
                      : `Afficher les ${formatNumber(Math.min(40, readyTotal - vehicles.length))} suivants`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <ListingQueue
          queue={queue}
          listings={
            queue === "active"
              ? activeHealthFilter === "price"
                ? priceMismatchListings
                : activeHealthFilter === "renew"
                  ? renewListings
                  : activeListings
              : queue === "renew"
                ? renewListings
                : queue === "remove"
                  ? removalListings
                  : historyListings
          }
          saving={saving}
          priceMismatchCount={listingCounts.PRICE_MISMATCH ?? priceMismatchListings.length}
          renewCount={listingCounts.RENEW_DUE ?? renewListings.length}
          healthFilter={activeHealthFilter}
          onHealthFilter={setActiveHealthFilter}
          onConfirmRemoved={confirmRemoved}
          onConfirmRenewed={confirmRenewed}
          onConfirmPrice={confirmPriceUpdated}
        />
      )}

    </FadeIn>
      {selected && listingPackage && (
        <section
          className="fixed inset-0 z-50 overflow-y-auto bg-background/80 p-3 backdrop-blur-md sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Préparer l’annonce"
        >
          <div className="ml-auto min-h-full w-full max-w-3xl overflow-hidden rounded-[1.75rem] bg-card shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-sidebar px-5 py-5 text-white sm:px-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-accent">
                  Prête au départ
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white">
                  {vehicleName(selected)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Stock {selected.stockNumber ?? "—"} ·{" "}
                  {formatCurrency(selected.price)} ·{" "}
                  {formatNumber(selected.mileage)} km
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-muted-foreground hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent"
                onClick={() => {
                  setSelected(null);
                  setExternalUrl("");
                  setDraftEdit(null);
                  setSavedDraft(null);
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
                  className="aspect-video w-full rounded-xl bg-muted object-cover"
                />
              )}

              {!marketplaceReady && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  <p className="font-semibold">Publication bloquée</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {listingPackage.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                    {selected.photos.length === 0 && (
                      <li>Au moins une photo est requise.</li>
                    )}
                    {draftDirty && (
                      <li>
                        Enregistrez vos modifications avant d’ouvrir Facebook.
                      </li>
                    )}
                    {!draftContentReady && (
                      <li>
                        Le titre doit avoir au moins 5 caractères et la
                        description au moins {MIN_LISTING_DESCRIPTION_LENGTH}{" "}
                        caractères.
                      </li>
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

              <div className="overflow-hidden rounded-2xl border border-primary/20 bg-muted">
                <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="flex items-center gap-2 text-primary">
                      <Zap size={17} fill="currentColor" />
                      <p className="text-xs font-black uppercase tracking-[0.16em]">
                        {extensionConnected ? "Assistant prêt" : "Mode rapide"}
                      </p>
                    </div>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-foreground">
                      {extensionConnected
                        ? "Ouvrir et remplir Facebook"
                        : "Préparer et ouvrir Facebook"}
                    </h3>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                      {extensionConnected
                        ? "Suivia Auto ouvre Marketplace, remplit les champs et ajoute automatiquement jusqu’à 20 photos. Il ne vous reste qu’à vérifier et publier."
                        : "Suivia Auto copie le texte, télécharge la photo et ouvre Marketplace. Ajoutez la photo, collez le contenu, puis publiez."}
                    </p>
                  </div>
                  <a
                    className={cn(
                      "inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:w-auto",
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
                <div className="grid border-t border-primary/10 bg-card/70 sm:grid-cols-3">
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
                      className="flex items-center gap-2 border-b border-primary/10 px-4 py-3 text-sm font-bold text-foreground last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sidebar font-mono text-[11px] text-sidebar-foreground">
                        {number}
                      </span>
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <details className="group rounded-2xl border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-bold text-foreground marker:content-none">
                  Voir ou copier le contenu de l’annonce
                  <span className="text-xs font-semibold text-primary group-open:hidden">
                    Afficher
                  </span>
                  <span className="hidden text-xs font-semibold text-primary group-open:inline">
                    Masquer
                  </span>
                </summary>
                <div className="space-y-5 border-t border-border p-4 sm:p-5">
                  <EditableDraftField
                    label="Titre"
                    value={listingPackage.title}
                    maxLength={100}
                    onChange={(title) =>
                      setDraftEdit((current) =>
                        current && current.vehicleId === selected.id
                          ? { ...current, title }
                          : current,
                      )
                    }
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
                  <label className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={carfaxLinkCheckbox.checked}
                      disabled={
                        !selected.sourceUrl ||
                        carfaxLinkCheckbox.lockedByOrganization
                      }
                      onChange={(event) => {
                        const checked = event.target.checked;
                        void apiFetch(`/api/v1/vehicles/${selected.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            includeCarfaxSourceUrl: checked,
                          }),
                        }).then((response) => {
                          if (!response.ok) return;
                          const apply = (vehicle: Vehicle) =>
                            vehicle.id === selected.id
                              ? { ...vehicle, includeCarfaxSourceUrl: checked }
                              : vehicle;
                          setVehicles((current) => current.map(apply));
                          setSelected((current) =>
                            current ? apply(current) : current,
                          );
                        });
                      }}
                    />
                    <span>
                      Inclure le lien de cette fiche (
                      <code className="text-xs">sourceUrl</code>) dans la
                      mention Carfax, à la place du texte sans URL. Pour tester
                      une annonce avant de l’activer partout (Paramètres).
                      Occasion et démonstrateurs seulement. Régénérez la
                      description pour appliquer le changement à un brouillon
                      déjà enregistré.
                      {carfaxLinkCheckbox.lockedByOrganization
                        ? " Activé pour toute l’organisation (Paramètres) — la case reflète l’état effectif."
                        : null}
                    </span>
                  </label>
                  <EditableDraftField
                    label="Description"
                    value={listingPackage.description}
                    multiline
                    maxLength={5000}
                    onChange={(description) =>
                      setDraftEdit((current) =>
                        current && current.vehicleId === selected.id
                          ? { ...current, description }
                          : current,
                      )
                    }
                    copied={copied === "description"}
                    onCopy={() =>
                      copyText(
                        "description",
                        descriptionForCopyOrSave(listingPackage.description),
                      )
                    }
                  />
                  <div className="rounded-xl border border-border bg-muted p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <div className="mb-3 sm:mb-0">
                      <p
                        className={cn(
                          "text-sm font-bold",
                          draftDirty ? "text-warning" : "text-signal",
                        )}
                      >
                        {draftDirty
                          ? "Modifications non enregistrées"
                          : "Enregistré pour votre profil"}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        L’extension utilisera cette version pour votre compte
                        seulement.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        className="btn-secondary justify-center"
                        onClick={() => void improveDescription()}
                        disabled={generatingDescription || savingDraft}
                      >
                        <Sparkles size={16} className="mr-2" />
                        {generatingDescription
                          ? "Rédaction en cours…"
                          : "Améliorer"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary justify-center"
                        onClick={() => void saveMarketplaceDraft()}
                        disabled={savingDraft || !draftDirty}
                      >
                        <Save size={16} className="mr-2" />
                        {savingDraft ? "Enregistrement…" : "Enregistrer"}
                      </button>
                      {nextReadyVehicle && (
                        <button
                          type="button"
                          className="btn-primary justify-center"
                          onClick={() => void saveMarketplaceDraft(true)}
                          disabled={savingDraft}
                        >
                          {savingDraft ? (
                            "Enregistrement…"
                          ) : (
                            <>
                              Enregistrer et suivant
                              <ChevronRight size={16} className="ml-2" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
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
                      `${listingPackage.title}\n\n${formatCurrency(selected.price)}\n\n${descriptionForCopyOrSave(listingPackage.description)}`,
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
                    Fiche {organization.name}{" "}
                    <ExternalLink className="ml-2" size={15} />
                  </a>
                )}
              </div>

              <div className="rounded-xl border-2 border-border bg-muted p-4 sm:p-5">
                <h3 className="font-bold text-foreground">Suivi automatique</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
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

              <p className="text-xs leading-5 text-muted-foreground">
                Aide à la conformité seulement : validez toujours l’exactitude,
                la disponibilité et les obligations applicables avant de
                publier. N’ajoutez aucun frais obligatoire au prix affiché.
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function VehicleRow({
  vehicle,
  preparing,
  onPrepare,
}: {
  vehicle: Vehicle;
  preparing: boolean;
  onPrepare: () => void;
}) {
  return (
    <article className="card group flex min-w-0 w-full flex-col gap-4 overflow-hidden p-3 sm:flex-row sm:items-center">
      <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:h-24 sm:w-36">
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
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sans photo
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 px-1">
        <span className="inline-flex rounded-md bg-primary/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-primary">
          Stock {vehicle.stockNumber ?? "—"}
        </span>
        <h3 className="mt-2 truncate text-base font-black tracking-tight text-foreground">
          {vehicleName(vehicle)}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatNumber(vehicle.mileage)} km · Synchronisé{" "}
          {formatDateTime(vehicle.updatedAt)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border px-1 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <p className="font-mono text-lg font-black tabular-nums text-foreground">
          {formatCurrency(vehicle.price)}
        </p>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={onPrepare}
          disabled={preparing}
        >
          {preparing ? (
            <RefreshCw size={16} className="mr-2 animate-spin" />
          ) : (
            <MousePointerClick size={16} className="mr-2" />
          )}
          {preparing ? "Préparation…" : "Publier"}
        </button>
      </div>
    </article>
  );
}

function ListingQueue({
  queue,
  listings,
  saving,
  priceMismatchCount = 0,
  renewCount = 0,
  healthFilter = "all",
  onHealthFilter,
  onConfirmRemoved,
  onConfirmRenewed,
  onConfirmPrice,
}: {
  queue: Queue;
  listings: Listing[];
  saving: boolean;
  priceMismatchCount?: number;
  renewCount?: number;
  healthFilter?: "all" | "price" | "renew";
  onHealthFilter?: (value: "all" | "price" | "renew") => void;
  onConfirmRemoved: (listing: Listing) => void;
  onConfirmRenewed?: (listing: Listing) => void;
  onConfirmPrice?: (listing: Listing) => void;
}) {
  const copy = {
    active: {
      title: "Annonces publiées",
      detail: "Prix à jour, renouvellement officiel, sans suppression.",
      empty: "Aucune annonce active enregistrée.",
    },
    renew: {
      title: "Renouvellement possible",
      detail:
        "Dans Facebook : Vendre > Vos annonces > Renouveler. Ne supprimez pas l’annonce pour la republier : une annonce supprimée peut compter dans votre limite mensuelle.",
      empty: "Aucun renouvellement dû pour le moment.",
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
  }[queue as "active" | "renew" | "remove" | "history"];

  return (
    <section aria-labelledby={`${queue}-heading`}>
      <h2 id={`${queue}-heading`} className="text-lg font-bold text-foreground">
        {copy.title}
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{copy.detail}</p>
      {queue === "active" && onHealthFilter && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "Toutes"],
              ["price", `Prix à mettre à jour (${priceMismatchCount})`],
              ["renew", `Renouvellement possible (${renewCount})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold",
                healthFilter === id
                  ? "bg-sidebar text-sidebar-foreground"
                  : "bg-muted text-muted-foreground",
              )}
              onClick={() => onHealthFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {listings.length === 0 ? (
        <EmptyState
          title={copy.empty}
          detail="Les changements apparaîtront automatiquement dans cette file."
        />
      ) : (
        <div className="grid min-w-0 gap-3">
          {listings.map((listing) => {
            const mismatch = listing.health?.priceMismatch;
            const hoursStale = listing.hoursStale;
            const staleTone =
              hoursStale == null
                ? "text-warning"
                : hoursStale > 48
                  ? "text-destructive"
                  : hoursStale >= 24
                    ? "text-warning"
                    : "text-muted-foreground";
            return (
              <article
                key={listing.id}
                className="card flex min-w-0 w-full flex-col gap-4 p-4 sm:flex-row sm:items-center"
              >
                <div className="h-20 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-28">
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
                  <h3 className="font-bold text-foreground">
                    {vehicleName(listing.vehicle)}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Stock {listing.vehicle.stockNumber ?? "—"} · Publiée par{" "}
                    {listing.user.name} · {formatDateTime(listing.listedAt)}
                  </p>
                  {mismatch?.direction === "up" && (
                    <p className="mt-2 text-sm font-bold text-destructive">
                      Prix augmenté : à corriger maintenant ({formatCurrency(mismatch.from)} → {formatCurrency(mismatch.to)}). Au Québec, un client peut exiger le prix annoncé.
                    </p>
                  )}
                  {mismatch?.direction === "down" && (
                    <p className="mt-2 text-sm font-semibold text-warning">
                      Prix à mettre à jour : {formatCurrency(mismatch.from)} → {formatCurrency(mismatch.to)}
                    </p>
                  )}
                  {(queue === "renew" || listing.health?.renewDue) && queue !== "remove" && (
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      En ligne depuis {listing.health?.daysSinceFreshness ?? 0} jours, renouvellement possible
                    </p>
                  )}
                  {queue === "remove" && (
                    <p className={`mt-2 text-sm font-semibold ${staleTone}`}>
                      {listingNeedsMarketplaceRemoval(listing)
                        ? "Annonce à retirer — le véhicule n’est plus en vente."
                        : `Vendu depuis ${hoursStale ?? "—"} h. Retirez l’annonce sur Facebook.`}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <p className="mr-2 font-mono font-bold tabular-nums">
                    {formatCurrency(listing.vehicle.price ?? listing.priceAtListing)}
                  </p>
                  {listing.externalUrl && (
                    <a
                      className="btn-secondary"
                      href={listing.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ouvrir l’annonce <ExternalLink className="ml-2" size={14} />
                    </a>
                  )}
                  {mismatch && onConfirmPrice && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onConfirmPrice(listing)}
                      disabled={saving}
                    >
                      J’ai mis le prix à jour dans Facebook
                    </button>
                  )}
                  {(queue === "renew" || listing.health?.renewDue) &&
                    onConfirmRenewed &&
                    queue !== "remove" && (
                      <>
                        <a
                          className="btn-secondary"
                          href={MARKETPLACE_YOUR_LISTINGS_URL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ouvrir mes annonces Marketplace
                        </a>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => onConfirmRenewed(listing)}
                          disabled={saving}
                        >
                          J’ai cliqué Renouveler
                        </button>
                      </>
                    )}
                  {queue === "remove" && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => onConfirmRemoved(listing)}
                      disabled={saving}
                    >
                      J’ai retiré l’annonce
                    </button>
                  )}
                </div>
              </article>
            );
          })}
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
        <label className="text-sm font-bold text-foreground">{label}</label>
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
          className="input min-h-72 resize-y bg-card leading-6"
          readOnly
          value={value}
        />
      ) : (
        <input className="input bg-card" readOnly value={value} />
      )}
    </div>
  );
}

function EditableDraftField({
  label,
  value,
  multiline = false,
  maxLength,
  copied,
  onChange,
  onCopy,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  maxLength: number;
  copied: boolean;
  onChange: (value: string) => void;
  onCopy: () => void;
}) {
  const inputId = `marketplace-${label.toLowerCase()}`;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label className="text-sm font-bold text-foreground" htmlFor={inputId}>
          {label}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {value.length}/{maxLength}
          </span>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5"
            onClick={onCopy}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span className="ml-1.5">{copied ? "Copié" : "Copier"}</span>
          </button>
        </div>
      </div>
      {multiline ? (
        <textarea
          id={inputId}
          className="input min-h-72 resize-y bg-card leading-6"
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={inputId}
          className="input bg-card"
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
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
          ? "border-signal/30 bg-signal/10 text-signal"
          : "border-warning/30 bg-warning/10 text-warning",
      )}
    >
      {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {label}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <CheckCircle2 className="mx-auto text-muted-foreground" size={30} />
      <p className="mt-3 font-bold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
