import { prisma, type Prisma } from "@lotpilot/db";
import Link from "next/link";
import { Card, EmptyState, Pagination, StatusBadge } from "@/components/ui";
import { money, timeAgo, vehicleName } from "@/lib/format";
import { requireOrgPage } from "@/server/rsc";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const STATUSES = ["DRAFT", "PREPARED", "POSTED", "DELIST_REQUESTED", "DELISTED", "ERROR"];

export default async function ListingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { user, role } = await requireOrgPage(orgId);
  const isManager = role === "OWNER" || role === "MANAGER";

  const status = typeof sp.status === "string" && STATUSES.includes(sp.status) ? sp.status : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  const where: Prisma.ListingWhereInput = {
    organizationId: orgId,
    ...(isManager ? {} : { userId: user.id }),
    ...(status ? { status: status as "POSTED" } : {}),
  };

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        vehicle: { include: { photos: { orderBy: { position: "asc" }, take: 1 } } },
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  const makeHref = (p: number) => {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (p > 1) query.set("page", String(p));
    const qs = query.toString();
    return `/o/${orgId}/listings${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">
          {isManager ? "All listings" : "My listings"}{" "}
          <span className="text-sm font-normal text-slate-500">({total})</span>
        </h1>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        <Link href={makeHrefBase(orgId, "")} className={pill(status === "")}>
          All
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={makeHrefBase(orgId, s)} className={pill(status === s)}>
            {s.replaceAll("_", " ").toLowerCase()}
          </Link>
        ))}
      </nav>

      <Card>
        {listings.length === 0 ? (
          <EmptyState
            title="No listings found"
            body="Start a listing from a vehicle page or the Chrome extension on Facebook Marketplace."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {listings.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <img
                  src={l.vehicle.photos[0]?.url ?? "https://placehold.co/96x64?text=No+photo"}
                  alt=""
                  className="h-12 w-16 rounded-md object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/o/${orgId}/inventory/${l.vehicleId}`}
                    className="text-sm font-medium text-slate-900 hover:text-brand-600"
                  >
                    {vehicleName(l.vehicle)}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {money(l.priceSnapshotCents)} · by {l.user.name} · updated {timeAgo(l.updatedAt)}
                  </p>
                </div>
                {l.externalUrl ? (
                  <a
                    href={l.externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs font-semibold text-brand-600 hover:underline"
                  >
                    View post ↗
                  </a>
                ) : null}
                <StatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} makeHref={makeHref} />
      </Card>
    </div>
  );
}

function makeHrefBase(orgId: string, status: string): string {
  return status ? `/o/${orgId}/listings?status=${status}` : `/o/${orgId}/listings`;
}

function pill(active: boolean): string {
  return `rounded-full px-3 py-1 text-xs font-medium capitalize ${
    active ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
  }`;
}
