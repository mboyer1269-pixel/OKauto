import { prisma, type Prisma } from "@lotpilot/db";
import Link from "next/link";
import { InventoryTable } from "@/components/inventory-table";
import { Card, EmptyState, Pagination } from "@/components/ui";
import { requireOrgPage } from "@/server/rsc";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { role } = await requireOrgPage(orgId);
  const isManager = role === "OWNER" || role === "MANAGER";

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  const where: Prisma.VehicleWhereInput = { organizationId: orgId };
  if (status && ["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"].includes(status)) {
    where.status = status as "AVAILABLE";
  } else if (!status) {
    where.status = { not: "ARCHIVED" };
  }
  if (q) {
    where.OR = [
      { vin: { contains: q, mode: "insensitive" } },
      { stockNumber: { contains: q, mode: "insensitive" } },
      { make: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, vehicles] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        photos: { orderBy: { position: "asc" }, take: 1 },
        listings: {
          where: { status: { in: ["PREPARED", "POSTED", "DELIST_REQUESTED"] } },
          select: { id: true, status: true, user: { select: { name: true } } },
        },
      },
    }),
  ]);

  const makeHref = (p: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (p > 1) query.set("page", String(p));
    const qs = query.toString();
    return `/o/${orgId}/inventory${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">
          Inventory <span className="text-sm font-normal text-slate-500">({total})</span>
        </h1>
        <div className="flex gap-2">
          {isManager ? (
            <>
              <Link href={`/o/${orgId}/inventory/import`} className="btn-secondary">
                Import CSV
              </Link>
              <Link href={`/o/${orgId}/inventory/new`} className="btn-primary">
                Add vehicle
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <form className="flex flex-wrap gap-2" action={`/o/${orgId}/inventory`} method="get">
        <input
          className="input max-w-xs"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search VIN, stock #, make, model…"
          aria-label="Search inventory"
        />
        <select className="input w-auto" name="status" defaultValue={status} aria-label="Filter by status">
          <option value="">All (except archived)</option>
          <option value="AVAILABLE">Available</option>
          <option value="PENDING">Pending</option>
          <option value="SOLD">Sold</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <button className="btn-secondary">Filter</button>
      </form>

      <Card>
        {vehicles.length === 0 ? (
          <EmptyState
            title={q || status ? "No vehicles match your filters" : "No vehicles yet"}
            body={
              q || status
                ? "Try a different search or clear the filters."
                : "Import a CSV, connect a feed in Sync health, or add a vehicle manually."
            }
          />
        ) : (
          <InventoryTable
            orgId={orgId}
            isManager={isManager}
            vehicles={vehicles.map((v) => ({
              id: v.id,
              name: [v.year, v.make, v.model, v.trim].filter(Boolean).join(" "),
              vin: v.vin,
              stockNumber: v.stockNumber,
              mileage: v.mileage,
              priceCents: v.priceCents,
              status: v.status,
              photo: v.photos[0]?.url ?? null,
              descriptionReady: Boolean(v.description),
              listedBy: v.listings.map((l) => l.user.name),
            }))}
          />
        )}
        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} makeHref={makeHref} />
      </Card>
    </div>
  );
}
