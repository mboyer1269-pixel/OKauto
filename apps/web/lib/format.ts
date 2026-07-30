export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US");
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d ago`;
  return formatDate(date);
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function vehicleName(v: { year?: number | null; make: string; model: string; trim?: string | null }): string {
  return `${v.year ?? ""} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`.replace(/\s+/g, " ").trim();
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-900/60 text-emerald-300",
  PRICE_CHANGED: "bg-amber-900/60 text-amber-300",
  SUSPECTED_SOLD: "bg-orange-900/60 text-orange-300",
  SOLD: "bg-sky-900/60 text-sky-300",
  ARCHIVED: "bg-ink-700/60 text-ink-200",
  INGESTED: "bg-ink-700/60 text-ink-200",
  DRAFT: "bg-ink-700/60 text-ink-200",
  READY: "bg-indigo-900/60 text-indigo-300",
  QUEUED: "bg-violet-900/60 text-violet-300",
  ASSIGNED: "bg-violet-900/60 text-violet-300",
  IN_PROGRESS: "bg-amber-900/60 text-amber-300",
  LIVE: "bg-emerald-900/60 text-emerald-300",
  ATTENTION: "bg-red-900/60 text-red-300",
  NEEDS_REMOVAL: "bg-orange-900/60 text-orange-300",
  REMOVED: "bg-sky-900/60 text-sky-300",
  ENDED: "bg-ink-700/60 text-ink-200",
  SUCCEEDED: "bg-emerald-900/60 text-emerald-300",
  FAILED: "bg-red-900/60 text-red-300",
  PARTIAL: "bg-amber-900/60 text-amber-300",
  RUNNING: "bg-amber-900/60 text-amber-300",
  PENDING: "bg-ink-700/60 text-ink-200",
  DEAD: "bg-red-900/60 text-red-300",
};

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "bg-ink-700/60 text-ink-200";
}
