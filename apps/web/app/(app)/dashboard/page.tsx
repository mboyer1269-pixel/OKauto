"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, PageHeader, Spinner } from "@/components/ui";
import { humanize, statusColor } from "@/lib/format";

interface Overview {
  vehiclesByStatus: Record<string, number>;
  listingsByStatus: Record<string, number>;
  activeSources: number;
  listedLast7d: number;
  queueAgingHours: number;
}

const CHECKLIST = [
  { key: "inventoryAdded", label: "Add your first inventory", href: "/inventory", cta: "Add vehicles" },
  { key: "descriptionGenerated", label: "Generate a compliant description", href: "/inventory", cta: "Open inventory" },
  { key: "extensionInstalled", label: "Pair the Chrome extension", href: "/settings?tab=extension", cta: "Pair extension" },
  { key: "teamInvited", label: "Invite your sales team", href: "/team", cta: "Invite team" },
] as const;

export default function DashboardPage() {
  const { api, activeRole, memberships, activeOrgId, reloadMemberships } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onboarding = memberships.find((m) => m.orgId === activeOrgId)?.org.onboarding ?? {};
  const canSeeAnalytics = activeRole === "ORG_OWNER" || activeRole === "ORG_MANAGER";

  useEffect(() => {
    if (!canSeeAnalytics) return;
    api<Overview>("/analytics/overview")
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [api, canSeeAnalytics]);

  const markOnboarding = async (key: string) => {
    try {
      await api("/orgs/current/onboarding", { method: "PATCH", body: { [key]: true } });
      await reloadMemberships();
    } catch {
      // best-effort checklist persistence
    }
  };

  const checklistDone = CHECKLIST.filter((item) => onboarding[item.key]).length;
  const showChecklist = checklistDone < CHECKLIST.length && !onboarding.dismissed;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your dealership at a glance" />

      {showChecklist ? (
        <Card className="mb-6 border-brand-700/50">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-brand-300">Getting started — {checklistDone}/{CHECKLIST.length}</h2>
            <Button variant="ghost" size="sm" onClick={() => void markOnboarding("dismissed")}>
              Dismiss
            </Button>
          </div>
          <ol className="grid gap-2 sm:grid-cols-2">
            {CHECKLIST.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-2 rounded-lg bg-ink-900/60 px-3 py-2">
                <span className={`text-sm ${onboarding[item.key] ? "text-ink-400 line-through" : "text-ink-200"}`}>
                  {onboarding[item.key] ? "✓ " : ""}
                  {item.label}
                </span>
                {!onboarding[item.key] ? (
                  <Link href={item.href} className="text-xs font-semibold text-brand-400 hover:text-brand-300">
                    {item.cta} →
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {error && canSeeAnalytics ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {canSeeAnalytics && !overview && !error ? <Spinner /> : null}

      {overview ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <p className="text-xs font-semibold uppercase text-ink-400">Live listings</p>
              <p className="mt-2 text-3xl font-black text-emerald-300">{overview.listingsByStatus.LIVE ?? 0}</p>
              <p className="mt-1 text-xs text-ink-400">{overview.listedLast7d} published in 7 days</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-ink-400">Active inventory</p>
              <p className="mt-2 text-3xl font-black text-ink-200">
                {(overview.vehiclesByStatus.ACTIVE ?? 0) + (overview.vehiclesByStatus.PRICE_CHANGED ?? 0)}
              </p>
              <p className="mt-1 text-xs text-ink-400">{overview.vehiclesByStatus.SOLD ?? 0} sold total</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-ink-400">In queue</p>
              <p className="mt-2 text-3xl font-black text-violet-300">
                {(overview.listingsByStatus.QUEUED ?? 0) + (overview.listingsByStatus.ASSIGNED ?? 0)}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                oldest {overview.queueAgingHours > 0 ? `${overview.queueAgingHours.toFixed(1)}h` : "—"}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-ink-400">Needs attention</p>
              <p className="mt-2 text-3xl font-black text-red-300">
                {(overview.listingsByStatus.ATTENTION ?? 0) + (overview.listingsByStatus.NEEDS_REMOVAL ?? 0)}
              </p>
              <p className="mt-1 text-xs text-ink-400">{overview.activeSources} active import sources</p>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-bold">Inventory by status</h2>
              <ul className="flex flex-wrap gap-2">
                {Object.entries(overview.vehiclesByStatus).map(([status, count]) => (
                  <li key={status}>
                    <Badge colorClass={statusColor(status)}>
                      {humanize(status)}: {count}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h2 className="mb-3 font-bold">Listings by status</h2>
              <ul className="flex flex-wrap gap-2">
                {Object.entries(overview.listingsByStatus).map(([status, count]) => (
                  <li key={status}>
                    <Badge colorClass={statusColor(status)}>
                      {humanize(status)}: {count}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : null}

      {!canSeeAnalytics ? (
        <Card>
          <h2 className="mb-2 font-bold">Welcome aboard</h2>
          <p className="text-sm text-ink-400">
            Head to <Link className="text-brand-400" href="/inventory">Inventory</Link> to see your vehicles, or open the
            extension popup to work through your listing queue.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
