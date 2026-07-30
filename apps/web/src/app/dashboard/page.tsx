"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Card, ErrorNote, PageHeader, Spinner, StatCard } from "@/components/ui";

interface Overview {
  inventory: { available: number; pending: number; sold: number; archived: number };
  listings: { active: number; publishedLast7Days: number };
  soldLast30Days: number;
  averageAvailablePriceCents: number | null;
}

interface Activity {
  days: { day: string; published: number }[];
}

export default function OverviewPage() {
  const { currentOrg } = useSession();
  const orgId = currentOrg?.orgId;
  const { data, error, loading } = useApi<Overview>(orgId ? `/api/v1/orgs/${orgId}/analytics/overview` : null);
  const { data: activity } = useApi<Activity>(orgId ? `/api/v1/orgs/${orgId}/analytics/activity` : null);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  const maxPublished = Math.max(1, ...(activity?.days.map((d) => d.published) ?? [1]));

  return (
    <div>
      <PageHeader
        title={`Welcome to ${currentOrg?.name ?? "your dealership"}`}
        subtitle="A live snapshot of inventory and Marketplace activity."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available vehicles" value={data.inventory.available} hint="Ready to list" />
        <StatCard label="Active listings" value={data.listings.active} hint="Live on Marketplace" />
        <StatCard label="Published (7 days)" value={data.listings.publishedLast7Days} hint="Team activity" />
        <StatCard label="Sold (30 days)" value={data.soldLast30Days} hint="Detected by sync" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Listing activity — last 30 days" className="lg:col-span-2">
          {activity && activity.days.length > 0 ? (
            <div className="flex h-36 items-end gap-1" role="img" aria-label="Daily published listings chart">
              {activity.days.map((d) => (
                <div key={d.day} className="group relative flex-1">
                  <div
                    className="rounded-t bg-indigo-500 transition-colors group-hover:bg-indigo-600"
                    style={{ height: `${Math.max(6, (d.published / maxPublished) * 130)}px` }}
                  />
                  <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-[10px] text-white group-hover:block">
                    {d.day}: {d.published}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              No published listings yet. Activity will appear here as your team lists vehicles.
            </p>
          )}
        </Card>
        <Card title="Inventory breakdown">
          <ul className="space-y-2 text-sm">
            {(
              [
                ["Available", data.inventory.available, "bg-emerald-500"],
                ["Pending", data.inventory.pending, "bg-amber-500"],
                ["Sold", data.inventory.sold, "bg-red-500"],
                ["Archived", data.inventory.archived, "bg-slate-400"],
              ] as const
            ).map(([label, count, color]) => (
              <li key={label} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${color}`} /> {label}
                </span>
                <span className="font-semibold text-slate-800">{count}</span>
              </li>
            ))}
            <li className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-600">Avg. asking price</span>
              <span className="font-semibold text-slate-800">{formatPrice(data.averageAvailablePriceCents)}</span>
            </li>
          </ul>
        </Card>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickLink href="/dashboard/inventory" title="Import inventory" body="Upload a CSV or connect a website/DMS feed." />
        <QuickLink href="/dashboard/listings" title="Review listings" body="See what is live, prepared, or needs removal." />
        <QuickLink href="/dashboard/team" title="Invite your team" body="Salespeople list vehicles with the extension." />
      </div>
    </div>
  );
}

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
    >
      <div className="text-sm font-semibold text-slate-800">{title} →</div>
      <div className="mt-1 text-xs text-slate-500">{body}</div>
    </Link>
  );
}
