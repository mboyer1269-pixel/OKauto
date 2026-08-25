import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number | string | null | undefined,
): string {
  if (amount == null) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-CA");
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("fr-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "AVAILABLE":
    case "ACTIVE":
      return "badge-success";
    case "PENDING":
    case "DRAFT":
      return "badge-warning";
    case "SOLD":
      return "badge-danger";
    case "ARCHIVED":
    case "REMOVED":
    case "STALE":
      return "badge-neutral";
    default:
      return "badge-neutral";
  }
}

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Disponible",
  ACTIVE: "Active",
  PENDING: "En attente",
  DRAFT: "Brouillon",
  SOLD: "Vendu",
  ARCHIVED: "Archivé",
  REMOVED: "Retiré",
  STALE: "À retirer",
  SUCCESS: "Réussie",
  FAILED: "Échouée",
  PARTIAL: "Partielle",
  PROCESSING: "En cours",
  HEALTHY: "Fonctionnelle",
  DEGRADED: "À surveiller",
  NO_SOURCES: "Aucune source",
};

export function formatStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status.toUpperCase()] ?? status.replaceAll("_", " ");
}
