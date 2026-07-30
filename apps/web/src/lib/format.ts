export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function miles(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("en-US")} mi`;
}

export function dateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function vehicleName(v: {
  year?: number | null;
  make: string;
  model: string;
  trim?: string | null;
}): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}
