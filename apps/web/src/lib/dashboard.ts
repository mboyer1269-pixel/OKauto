import { demoDashboard, type DashboardResponse } from "@okauto/shared";
import { prisma } from "@okauto/db";
import type { SessionPrincipal } from "./auth";

function toIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

export async function getDashboardData(principal: SessionPrincipal): Promise<DashboardResponse> {
  if (!process.env.DATABASE_URL) {
    return demoDashboard;
  }

  try {
    const [vehicles, listings, activity, notifications, syncRuns] = await Promise.all([
      prisma.vehicle.findMany({
        where: { organizationId: principal.organizationId },
        include: {
          media: true,
          listings: { orderBy: { updatedAt: "desc" }, take: 1, include: { assignedTo: true } }
        },
        orderBy: { updatedAt: "desc" },
        take: 100
      }),
      prisma.listing.findMany({
        where: { organizationId: principal.organizationId },
        include: { assignedTo: true, vehicle: true },
        orderBy: { updatedAt: "desc" },
        take: 100
      }),
      prisma.activityEvent.findMany({
        where: { organizationId: principal.organizationId },
        include: { actor: true, vehicle: true, listing: true },
        orderBy: { createdAt: "desc" },
        take: 25
      }),
      prisma.notification.findMany({
        where: { organizationId: principal.organizationId },
        orderBy: { createdAt: "desc" },
        take: 25
      }),
      prisma.sourceSyncRun.findMany({
        where: { source: { organizationId: principal.organizationId } },
        include: { source: true },
        orderBy: { startedAt: "desc" },
        take: 10
      })
    ]);

    const availableCount = vehicles.filter((vehicle) => vehicle.status === "AVAILABLE").length;
    const readyCount = listings.filter((listing) => listing.status === "READY" || listing.status === "DRAFT").length;
    const postedCount = listings.filter((listing) => listing.status === "POSTED").length;
    const soldAlerts = notifications.filter((notification) => notification.type === "SOLD_ALERT" && !notification.resolvedAt).length;

    return {
      metrics: [
        { label: "Active inventory", value: availableCount, tone: "good" },
        { label: "Ready to list", value: readyCount, tone: readyCount > 0 ? "warn" : "neutral" },
        { label: "Posted listings", value: postedCount, tone: "neutral" },
        { label: "Sold alerts", value: soldAlerts, tone: soldAlerts > 0 ? "critical" : "good" }
      ],
      inventory: vehicles.map((vehicle) => {
        const latestListing = vehicle.listings[0];
        return {
          id: vehicle.id,
          vin: vehicle.vin ?? undefined,
          stockNumber: vehicle.stockNumber ?? undefined,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim ?? undefined,
          bodyStyle: vehicle.bodyStyle ?? undefined,
          drivetrain: vehicle.drivetrain ?? undefined,
          transmission: vehicle.transmission ?? undefined,
          fuelType: vehicle.fuelType ?? undefined,
          exteriorColor: vehicle.exteriorColor ?? undefined,
          interiorColor: vehicle.interiorColor ?? undefined,
          mileage: vehicle.mileage ?? undefined,
          price: vehicle.price ?? undefined,
          status: vehicle.status,
          location: vehicle.location ?? undefined,
          features: vehicle.features,
          notes: vehicle.notes ?? undefined,
          updatedAt: vehicle.updatedAt.toISOString(),
          salesperson: latestListing?.assignedTo?.name,
          listingStatus: latestListing?.status,
          photoCount: vehicle.media.length
        };
      }),
      listings: listings.map((listing) => ({
        id: listing.id,
        vehicleId: listing.vehicleId,
        title: listing.title,
        status: listing.status,
        salesperson: listing.assignedTo?.name,
        marketplaceUrl: listing.marketplaceUrl ?? undefined,
        postedAt: toIso(listing.postedAt),
        updatedAt: listing.updatedAt.toISOString()
      })),
      activity: activity.map((event) => ({
        id: event.id,
        actor: event.actor?.name ?? "System",
        action: event.action.replaceAll("_", " "),
        target: event.vehicle
          ? `${event.vehicle.year} ${event.vehicle.make} ${event.vehicle.model}`
          : event.listing?.title ?? "organization",
        createdAt: event.createdAt.toISOString()
      })),
      notifications: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        severity: notification.severity,
        resolvedAt: toIso(notification.resolvedAt)
      })),
      syncHealth: syncRuns.map((run) => ({
        source: run.source.name,
        status: run.status === "SUCCESS" ? "healthy" : run.status === "FAILED" ? "failed" : "warning",
        lastRunAt: run.startedAt.toISOString(),
        message: run.message ?? `${run.recordsUpserted} upserted, ${run.recordsSkipped} skipped`
      }))
    };
  } catch (error) {
    console.error("dashboard_load_failed", error);
    return demoDashboard;
  }
}
