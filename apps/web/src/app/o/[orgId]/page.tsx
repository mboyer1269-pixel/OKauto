import { prisma } from "@lotpilot/db";
import Link from "next/link";
import { Card, CardHeader, EmptyState, StatCard, StatusBadge } from "@/components/ui";
import { dateTime, money, timeAgo, vehicleName } from "@/lib/format";
import { requireOrgPage } from "@/server/rsc";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, role } = await requireOrgPage(orgId);
  const isManager = role === "OWNER" || role === "MANAGER";
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [
    available,
    sold30,
    activeListings,
    pendingDelists,
    erroredSources,
    myListings,
    recentVehicles,
    recentAudit,
  ] = await Promise.all([
    prisma.vehicle.count({ where: { organizationId: orgId, status: "AVAILABLE" } }),
    prisma.vehicle.count({
      where: { organizationId: orgId, status: "SOLD", soldAt: { gte: thirtyDaysAgo } },
    }),
    prisma.listing.count({ where: { organizationId: orgId, status: "POSTED" } }),
    prisma.listing.count({
      where: {
        organizationId: orgId,
        status: "DELIST_REQUESTED",
        ...(isManager ? {} : { userId: user.id }),
      },
    }),
    prisma.inventorySource.count({ where: { organizationId: orgId, status: "ERROR" } }),
    prisma.listing.findMany({
      where: { organizationId: orgId, userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { vehicle: true },
    }),
    prisma.vehicle.findMany({
      where: { organizationId: orgId, status: "AVAILABLE" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { photos: { orderBy: { position: "asc" }, take: 1 } },
    }),
    isManager
      ? prisma.auditLog.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { user: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Overview</h1>
        <div className="flex gap-2">
          <Link href={`/o/${orgId}/inventory/import`} className="btn-secondary">
            Import CSV
          </Link>
          <Link href={`/o/${orgId}/inventory/new`} className="btn-primary">
            Add vehicle
          </Link>
        </div>
      </div>

      {pendingDelists > 0 ? (
        <div role="alert" className="card border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-800">
            {pendingDelists} listing{pendingDelists === 1 ? "" : "s"} need to be removed from
            Facebook Marketplace
          </p>
          <p className="mt-0.5 text-sm text-red-700">
            The vehicles were sold or removed from inventory.{" "}
            <Link
              className="font-semibold underline"
              href={`/o/${orgId}/listings?status=DELIST_REQUESTED`}
            >
              Review and delist
            </Link>
          </p>
        </div>
      ) : null}
      {erroredSources > 0 && isManager ? (
        <div role="alert" className="card border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            {erroredSources} inventory source{erroredSources === 1 ? "" : "s"} failing to sync —{" "}
            <Link className="underline" href={`/o/${orgId}/sources`}>
              check sync health
            </Link>
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Available vehicles" value={available} />
        <StatCard label="Active listings" value={activeListings} tone="good" />
        <StatCard label="Sold (30 days)" value={sold30} />
        <StatCard
          label="Pending delists"
          value={pendingDelists}
          tone={pendingDelists > 0 ? "bad" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="My recent listings"
            action={
              <Link
                className="text-sm font-semibold text-brand-600 hover:underline"
                href={`/o/${orgId}/listings`}
              >
                View all
              </Link>
            }
          />
          {myListings.length === 0 ? (
            <EmptyState
              title="No listings yet"
              body="Open a vehicle and start a Marketplace listing, or use the Chrome extension on facebook.com/marketplace."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myListings.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/o/${orgId}/inventory/${l.vehicleId}`}
                      className="truncate text-sm font-medium text-slate-900 hover:text-brand-600"
                    >
                      {vehicleName(l.vehicle)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {money(l.priceSnapshotCents)} · updated {timeAgo(l.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Newest inventory"
            action={
              <Link
                className="text-sm font-semibold text-brand-600 hover:underline"
                href={`/o/${orgId}/inventory`}
              >
                View all
              </Link>
            }
          />
          {recentVehicles.length === 0 ? (
            <EmptyState
              title="No vehicles yet"
              body="Import a CSV, connect a feed, or add a vehicle manually to get started."
              action={
                <Link className="btn-primary" href={`/o/${orgId}/inventory/import`}>
                  Import inventory
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentVehicles.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-5 py-3">
                  <img
                    src={v.photos[0]?.url ?? "https://placehold.co/96x64?text=No+photo"}
                    alt=""
                    className="h-12 w-16 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/o/${orgId}/inventory/${v.id}`}
                      className="truncate text-sm font-medium text-slate-900 hover:text-brand-600"
                    >
                      {vehicleName(v)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {v.stockNumber ?? "—"} · {money(v.priceCents)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {isManager && recentAudit.length > 0 ? (
        <Card>
          <CardHeader
            title="Recent activity"
            action={
              <Link
                className="text-sm font-semibold text-brand-600 hover:underline"
                href={`/o/${orgId}/audit`}
              >
                Full audit log
              </Link>
            }
          />
          <ul className="divide-y divide-slate-100">
            {recentAudit.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{log.user?.name ?? "System"}</span>{" "}
                  <span className="text-slate-500">{log.action}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{dateTime(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
