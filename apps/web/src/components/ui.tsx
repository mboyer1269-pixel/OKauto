import Link from "next/link";
import { type ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  SOLD: "bg-slate-200 text-slate-700",
  ARCHIVED: "bg-slate-100 text-slate-500",
  DRAFT: "bg-slate-100 text-slate-600",
  PREPARED: "bg-sky-50 text-sky-700",
  POSTED: "bg-emerald-50 text-emerald-700",
  DELIST_REQUESTED: "bg-red-50 text-red-700",
  DELISTED: "bg-slate-200 text-slate-600",
  ERROR: "bg-red-100 text-red-800",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAUSED: "bg-amber-50 text-amber-700",
  SUCCESS: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  RUNNING: "bg-sky-50 text-sky-700",
  OWNER: "bg-purple-50 text-purple-700",
  MANAGER: "bg-sky-50 text-sky-700",
  SALESPERSON: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: string }) {
  const color = badgeColors[status] ?? "bg-slate-100 text-slate-600";
  return <span className={`badge ${color}`}>{status.replaceAll("_", " ").toLowerCase()}</span>;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {body ? <p className="max-w-md text-sm text-slate-500">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const tones = {
    default: "text-slate-900",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  };
  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  makeHref,
}: {
  page: number;
  totalPages: number;
  makeHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-between px-5 py-3 text-sm" aria-label="Pagination">
      <span className="text-slate-500">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="btn-secondary" href={makeHref(page - 1)}>
            Previous
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link className="btn-secondary" href={makeHref(page + 1)}>
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
