import { prisma } from "@lotpilot/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DescriptionEditor } from "@/components/description-editor";
import { ListingPanel } from "@/components/listing-panel";
import { VehicleAdminActions } from "@/components/vehicle-admin-actions";
import { Card, CardHeader, StatusBadge } from "@/components/ui";
import { dateTime, miles, money, vehicleName } from "@/lib/format";
import { requireOrgPage } from "@/server/rsc";

export const dynamic = "force-dynamic";

export default async function VehiclePage({
  params,
}: {
  params: Promise<{ orgId: string; vehicleId: string }>;
}) {
  const { orgId, vehicleId } = await params;
  const { user, role } = await requireOrgPage(orgId);
  const isManager = role === "OWNER" || role === "MANAGER";

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId: orgId },
    include: {
      photos: { orderBy: { position: "asc" } },
      priceHistory: { orderBy: { detectedAt: "desc" }, take: 5 },
      source: { select: { name: true, type: true } },
      listings: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!vehicle) notFound();

  const specs: Array<[string, string]> = [
    ["VIN", vehicle.vin ?? "—"],
    ["Stock #", vehicle.stockNumber ?? "—"],
    ["Mileage", miles(vehicle.mileage)],
    ["Body style", vehicle.bodyStyle ?? "—"],
    ["Drivetrain", vehicle.drivetrain ?? "—"],
    ["Transmission", vehicle.transmission ?? "—"],
    ["Fuel", vehicle.fuelType ?? "—"],
    ["Engine", vehicle.engine ?? "—"],
    ["Exterior", vehicle.exteriorColor ?? "—"],
    ["Interior", vehicle.interiorColor ?? "—"],
    ["Condition", vehicle.condition.replaceAll("_", " ").toLowerCase()],
    ["Source", vehicle.source ? `${vehicle.source.name}` : "manual"],
  ];

  const myActiveListing = vehicle.listings.find(
    (l) => l.userId === user.id && ["DRAFT", "PREPARED", "POSTED", "DELIST_REQUESTED"].includes(l.status),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/o/${orgId}/inventory`} className="text-sm text-slate-500 hover:text-brand-600">
            ← Inventory
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-xl font-bold">
            {vehicleName(vehicle)}
            <StatusBadge status={vehicle.status} />
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {money(vehicle.priceCents)}
            {vehicle.previousPriceCents != null && vehicle.previousPriceCents !== vehicle.priceCents ? (
              <span className="ml-2 text-slate-400 line-through">{money(vehicle.previousPriceCents)}</span>
            ) : null}
            {" · "}added {dateTime(vehicle.firstSeenAt)}
            {vehicle.soldAt ? ` · sold ${dateTime(vehicle.soldAt)}` : ""}
          </p>
        </div>
        {isManager ? <VehicleAdminActions orgId={orgId} vehicleId={vehicle.id} status={vehicle.status} /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={`Photos (${vehicle.photos.length})`} />
            {vehicle.photos.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No photos on file.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 md:grid-cols-4">
                {vehicle.photos.map((p) => (
                  <img
                    key={p.id}
                    src={p.url}
                    alt={`${vehicleName(vehicle)} photo ${p.position + 1}`}
                    className="aspect-[3/2] w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
          </Card>

          <DescriptionEditor
            orgId={orgId}
            vehicleId={vehicle.id}
            initialDescription={vehicle.description ?? ""}
            descriptionSource={vehicle.descriptionSource}
          />

          <Card>
            <CardHeader title="Listing history" />
            {vehicle.listings.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                Nobody has listed this vehicle yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {vehicle.listings.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div>
                      <span className="font-medium">{l.user.name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        created {dateTime(l.createdAt)}
                        {l.postedAt ? ` · posted ${dateTime(l.postedAt)}` : ""}
                        {l.delistedAt ? ` · delisted ${dateTime(l.delistedAt)}` : ""}
                      </span>
                      {l.externalUrl ? (
                        <a
                          href={l.externalUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ml-2 text-xs font-semibold text-brand-600 hover:underline"
                        >
                          View on Marketplace ↗
                        </a>
                      ) : null}
                    </div>
                    <StatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <ListingPanel
            orgId={orgId}
            vehicleId={vehicle.id}
            vehicleStatus={vehicle.status}
            myListing={
              myActiveListing
                ? { id: myActiveListing.id, status: myActiveListing.status, externalUrl: myActiveListing.externalUrl }
                : null
            }
          />

          <Card>
            <CardHeader title="Specifications" />
            <dl className="divide-y divide-slate-100">
              {specs.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 px-5 py-2 text-sm">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {vehicle.priceHistory.length > 0 ? (
            <Card>
              <CardHeader title="Price history" />
              <ul className="divide-y divide-slate-100">
                {vehicle.priceHistory.map((pc) => (
                  <li key={pc.id} className="flex justify-between px-5 py-2 text-sm">
                    <span className="text-slate-500">{dateTime(pc.detectedAt)}</span>
                    <span>
                      <span className="text-slate-400 line-through">{money(pc.oldPriceCents)}</span>{" "}
                      <span className="font-medium">{money(pc.newPriceCents)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
