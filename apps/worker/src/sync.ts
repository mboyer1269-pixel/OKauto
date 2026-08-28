import { prisma } from "@okauto/database";
import type { SyncVehicle } from "@okauto/shared";
import { extractD2cDetailPhotos, parseSyncFeed } from "@okauto/shared";

export interface SyncResult {
  synced: number;
  errors: number;
  priceChanges: number;
  sold: number;
}

export async function runSyncSource(syncSourceId: string): Promise<SyncResult> {
  const source = await prisma.syncSource.findUnique({
    where: { id: syncSourceId },
  });
  if (!source) throw new Error("Sync source not found");

  const startedAt = new Date();
  const syncRun = await prisma.syncRun.create({
    data: {
      organizationId: source.organizationId,
      syncSourceId: source.id,
      startedAt,
    },
  });

  try {
    const { body, contentType, expectedCount } = await fetchSyncInventory(
      source.url,
      source.adapter,
    );
    const vehicles = parseSyncFeed(source.adapter, body, contentType);
    if (vehicles.length === 0) {
      throw new Error("Inventory feed returned no valid vehicles");
    }
    if (expectedCount != null && vehicles.length !== expectedCount) {
      throw new Error(
        `Inventory feed announced ${expectedCount} vehicles but ${vehicles.length} were parsed`,
      );
    }

    if (source.adapter === "d2c") {
      await enrichD2cGalleryPhotos(vehicles, source.organizationId);
    }

    let successCount = 0;
    let errorCount = 0;
    let priceChanges = 0;

    for (const v of vehicles) {
      if (!v.vin) {
        errorCount++;
        continue;
      }

      try {
        const existing = await prisma.vehicle.findUnique({
          where: {
            organizationId_vin: {
              organizationId: source.organizationId,
              vin: v.vin,
            },
          },
          select: { id: true, price: true },
        });

        const newPrice = v.price != null ? v.price : undefined;
        const oldPrice = existing?.price ? Number(existing.price) : null;
        const status = mapStatus(v.status);

        const vehicle = await prisma.vehicle.upsert({
          where: {
            organizationId_vin: {
              organizationId: source.organizationId,
              vin: v.vin,
            },
          },
          create: {
            organizationId: source.organizationId,
            syncSourceId: source.id,
            sourceUrl: v.sourceUrl,
            vin: v.vin,
            stockNumber: v.stockNumber,
            year: v.year,
            make: v.make,
            model: v.model,
            trim: v.trim,
            mileage: v.mileage,
            price: newPrice,
            exteriorColor: v.exteriorColor,
            interiorColor: v.interiorColor,
            description: v.description,
            transmission: v.transmission,
            fuelType: v.fuelType,
            drivetrain: v.drivetrain,
            engine: v.engine,
            bodyStyle: v.bodyStyle,
            doors: v.doors,
            cylinders: v.cylinders,
            condition: v.condition,
            status,
            soldAt: status === "SOLD" ? new Date() : null,
            lastSeenAt: startedAt,
            missingSyncCount: 0,
          },
          update: {
            syncSourceId: source.id,
            sourceUrl: v.sourceUrl,
            stockNumber: v.stockNumber,
            year: v.year,
            make: v.make,
            model: v.model,
            trim: v.trim,
            mileage: v.mileage,
            price: newPrice,
            exteriorColor: v.exteriorColor,
            interiorColor: v.interiorColor,
            description: v.description,
            transmission: v.transmission,
            fuelType: v.fuelType,
            drivetrain: v.drivetrain,
            engine: v.engine,
            bodyStyle: v.bodyStyle,
            doors: v.doors,
            cylinders: v.cylinders,
            condition: v.condition,
            status,
            soldAt: status === "SOLD" ? new Date() : null,
            lastSeenAt: startedAt,
            missingSyncCount: 0,
          },
        });

        if (
          existing &&
          oldPrice != null &&
          newPrice != null &&
          oldPrice !== newPrice
        ) {
          priceChanges++;
          await notifyPriceChange(
            source.organizationId,
            vehicle.id,
            oldPrice,
            newPrice,
            v,
          );
        }

        if (v.photos && v.photos.length > 0) {
          await syncVehiclePhotos(vehicle.id, v.photos);
        }

        successCount++;
      } catch (err) {
        console.warn("Sync vehicle error:", err);
        errorCount++;
      }
    }

    const activeVins = vehicles
      .map((vehicle) => vehicle.vin)
      .filter(
        (vin): vin is string => typeof vin === "string" && vin.length > 0,
      );
    const missingVehicles = await prisma.vehicle.findMany({
      where: {
        syncSourceId: source.id,
        status: { in: ["AVAILABLE", "PENDING"] },
        vin: { notIn: activeVins },
      },
      select: {
        id: true,
        vin: true,
        year: true,
        make: true,
        model: true,
        assignedToId: true,
        missingSyncCount: true,
      },
    });

    const trackedActiveCount = await prisma.vehicle.count({
      where: {
        syncSourceId: source.id,
        status: { in: ["AVAILABLE", "PENDING"] },
      },
    });
    const missingSafetyLimit = Math.max(
      10,
      Math.ceil(trackedActiveCount * 0.25),
    );
    const anomalousDrop = missingVehicles.length > missingSafetyLimit;
    const confirmedMissingVehicles = anomalousDrop
      ? []
      : missingVehicles.filter((vehicle) => vehicle.missingSyncCount >= 1);

    if (!anomalousDrop && missingVehicles.length > 0) {
      await prisma.vehicle.updateMany({
        where: { id: { in: missingVehicles.map((vehicle) => vehicle.id) } },
        data: { missingSyncCount: { increment: 1 } },
      });
    }

    if (confirmedMissingVehicles.length > 0) {
      const soldAt = new Date();
      const missingVehicleIds = confirmedMissingVehicles.map(
        (vehicle) => vehicle.id,
      );
      await prisma.vehicle.updateMany({
        where: { id: { in: missingVehicleIds } },
        data: { status: "SOLD", soldAt },
      });
      await prisma.listing.updateMany({
        where: {
          organizationId: source.organizationId,
          vehicleId: { in: missingVehicleIds },
          status: "ACTIVE",
        },
        data: { status: "STALE", lastCheckedAt: soldAt },
      });
      await notifySoldVehicles(source.organizationId, confirmedMissingVehicles);
    }

    const runStatus = anomalousDrop
      ? "DEGRADED"
      : errorCount > 0
        ? successCount === 0
          ? "FAILED"
          : "PARTIAL"
        : "SUCCESS";
    const runError = anomalousDrop
      ? `Safety stop: ${missingVehicles.length} of ${trackedActiveCount} active vehicles disappeared from one feed response`
      : errorCount > 0
        ? `${errorCount} vehicle(s) failed to sync`
        : null;
    const completedAt = new Date();

    await prisma.$transaction([
      prisma.syncSource.update({
        where: { id: syncSourceId },
        data: {
          lastSyncAt: completedAt,
          lastSyncStatus: runStatus.toLowerCase(),
          lastSyncError: runError,
        },
      }),
      prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: runStatus,
          expectedCount,
          receivedCount: vehicles.length,
          successCount,
          errorCount,
          priceChanges,
          soldCount: confirmedMissingVehicles.length,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          error: runError,
          completedAt,
        },
      }),
    ]);

    return {
      synced: successCount,
      errors: errorCount,
      priceChanges,
      sold: confirmedMissingVehicles.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.syncSource.update({
        where: { id: syncSourceId },
        data: {
          lastSyncAt: completedAt,
          lastSyncStatus: "error",
          lastSyncError: message,
        },
      }),
      prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "FAILED",
          error: message,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          completedAt,
        },
      }),
    ]);
    throw err;
  }
}

interface InventoryResponse {
  body: string;
  contentType: string | null;
  expectedCount?: number;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36 Suivia-Sync/1.0",
  Accept: "application/json, text/html,application/xhtml+xml",
};

async function fetchSyncInventory(
  url: string,
  adapter: string,
): Promise<InventoryResponse> {
  const response = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const body = await response.text();
  if (adapter !== "d2c") {
    return { body, contentType: response.headers.get("content-type") };
  }

  const filterTag = body.match(
    /<input\b[^>]*\bid=["']filterid["'][^>]*>/i,
  )?.[0];
  const encodedFilter = filterTag?.match(/\bvalue=["']([^"']+)["']/i)?.[1];
  if (!encodedFilter) {
    throw new Error("D2C inventory filter was not found on the source page");
  }

  let filter: Record<string, unknown>;
  try {
    filter = JSON.parse(
      Buffer.from(encodedFilter, "base64").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    throw new Error("D2C inventory filter could not be decoded");
  }

  const basic =
    typeof filter.basic === "object" && filter.basic !== null
      ? (filter.basic as Record<string, unknown>)
      : {};
  const pageSizeValue = Array.isArray(basic.fltPageId)
    ? basic.fltPageId[1]
    : undefined;
  const pageSize = Number(pageSizeValue) || 36;
  const compactUrl = typeof filter.url === "string" ? filter.url : "";
  const compactFilter = compactUrl.match(/\/([^/]+)\.html(?:[?#]|$)/)?.[1];
  if (!compactFilter || !/q\d+/.test(compactFilter)) {
    throw new Error("D2C inventory pagination token was not found");
  }

  const pages = [body];
  const seenVins = extractD2cVins(body);
  const maxPages = 50;

  for (let page = 1; page < maxPages; page++) {
    const pageUrl = new URL(response.url);
    pageUrl.searchParams.set(
      "filterid",
      compactFilter.replace(/q\d+/, `q${page}`),
    );

    const pageResponse = await fetch(pageUrl, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });
    if (!pageResponse.ok) {
      throw new Error(
        `D2C inventory page ${page + 1} failed with HTTP ${pageResponse.status}`,
      );
    }

    const pageBody = await pageResponse.text();
    const pageVins = extractD2cVins(pageBody);
    const newVins = [...pageVins].filter((vin) => !seenVins.has(vin));
    if (newVins.length === 0) {
      if (pageVins.size >= pageSize) {
        throw new Error(`D2C inventory pagination repeated page ${page + 1}`);
      }
      break;
    }

    pages.push(pageBody);
    for (const vin of newVins) seenVins.add(vin);
    if (pageVins.size < pageSize) break;

    if (page === maxPages - 1) {
      throw new Error(
        `D2C inventory exceeded the ${maxPages}-page safety limit`,
      );
    }
  }

  return {
    body: pages.join("\n"),
    contentType: "text/html",
    expectedCount: seenVins.size,
  };
}

async function enrichD2cGalleryPhotos(
  vehicles: SyncVehicle[],
  organizationId: string,
) {
  const vins = vehicles
    .map((vehicle) => vehicle.vin)
    .filter((vin): vin is string => Boolean(vin));
  const storedVehicles = await prisma.vehicle.findMany({
    where: { organizationId, vin: { in: vins } },
    select: { vin: true, _count: { select: { photos: true } } },
  });
  const storedPhotoCounts = new Map(
    storedVehicles.flatMap((vehicle) =>
      vehicle.vin ? ([[vehicle.vin, vehicle._count.photos]] as const) : [],
    ),
  );
  const candidates = vehicles.filter(
    (vehicle) =>
      vehicle.vin &&
      vehicle.sourceUrl &&
      (storedPhotoCounts.get(vehicle.vin) ?? 0) <= 1 &&
      (vehicle.photos?.length ?? 0) <= 1,
  );
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(6, candidates.length) }, async () => {
      while (nextIndex < candidates.length) {
        const candidate = candidates[nextIndex++];
        try {
          const response = await fetch(candidate.sourceUrl!, {
            headers: BROWSER_HEADERS,
            redirect: "follow",
          });
          if (!response.ok) continue;

          const gallery = extractD2cDetailPhotos(
            await response.text(),
            candidate.sourceUrl!,
          );
          if (gallery.length > (candidate.photos?.length ?? 0)) {
            candidate.photos = gallery;
          }
        } catch (error) {
          console.warn(
            `D2C gallery could not be loaded for VIN ${candidate.vin}:`,
            error,
          );
        }
      }
    }),
  );
}

function extractD2cVins(html: string): Set<string> {
  return new Set(
    [...html.matchAll(/\bdata-vin=["']([A-HJ-NPR-Z0-9]{11,17})["']/gi)].map(
      (match) => match[1].toUpperCase(),
    ),
  );
}

function mapStatus(
  status?: string,
): "AVAILABLE" | "PENDING" | "SOLD" | "ARCHIVED" {
  const s = String(status ?? "available").toLowerCase();
  if (s.includes("sold")) return "SOLD";
  if (s.includes("pending")) return "PENDING";
  if (s.includes("archived")) return "ARCHIVED";
  return "AVAILABLE";
}

interface MissingVehicle {
  id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  assignedToId: string | null;
  missingSyncCount: number;
}

async function notifySoldVehicles(
  organizationId: string,
  vehicles: MissingVehicle[],
) {
  let managerIds: string[] | null = null;

  for (const vehicle of vehicles) {
    if (vehicle.assignedToId == null && managerIds == null) {
      const managers = await prisma.organizationMember.findMany({
        where: { organizationId, role: { in: ["OWNER", "ADMIN", "MANAGER"] } },
        select: { userId: true },
      });
      managerIds = managers.map((manager) => manager.userId);
    }

    const recipients = vehicle.assignedToId
      ? [vehicle.assignedToId]
      : (managerIds ?? []);
    const title = [vehicle.year, vehicle.make, vehicle.model]
      .filter(Boolean)
      .join(" ");
    for (const userId of recipients) {
      await prisma.notification.create({
        data: {
          userId,
          type: "SOLD_ALERT",
          title: "Vehicle Removed From Dealer Inventory",
          message: `${title || "Vehicle"} (VIN ${vehicle.vin ?? "unknown"}) is no longer present in the dealer feed and was marked sold.`,
          metadata: { vehicleId: vehicle.id, vin: vehicle.vin },
        },
      });
    }
  }
}

async function syncVehiclePhotos(vehicleId: string, photoUrls: string[]) {
  const incoming = [
    ...new Set(photoUrls.filter((url) => url.startsWith("https://"))),
  ].slice(0, 20);
  if (incoming.length === 0) return;

  const existing = await prisma.vehiclePhoto.findMany({
    where: { vehicleId },
    orderBy: { sortOrder: "asc" },
    select: { url: true },
  });
  if (existing.length > incoming.length) return;
  if (
    existing.length === incoming.length &&
    existing.every((photo, index) => photo.url === incoming[index])
  ) {
    return;
  }

  await prisma.$transaction([
    prisma.vehiclePhoto.deleteMany({ where: { vehicleId } }),
    prisma.vehiclePhoto.createMany({
      data: incoming.map((url, index) => ({
        vehicleId,
        url,
        sortOrder: index,
        isPrimary: index === 0,
      })),
    }),
  ]);
}

async function notifyPriceChange(
  organizationId: string,
  vehicleId: string,
  oldPrice: number,
  newPrice: number,
  vehicle: SyncVehicle,
) {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId, role: { in: ["OWNER", "ADMIN", "MANAGER"] } },
    select: { userId: true },
  });

  const title =
    `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim();
  for (const m of members) {
    await prisma.notification.create({
      data: {
        userId: m.userId,
        type: "PRICE_CHANGE",
        title: "Price Change Detected",
        message: `${title} (VIN ${vehicle.vin}) price changed from $${oldPrice.toLocaleString("en-CA")} to $${newPrice.toLocaleString("en-CA")}.`,
        metadata: { vehicleId, oldPrice, newPrice, vin: vehicle.vin },
      },
    });
  }
}
