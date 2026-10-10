import { prisma } from "@okauto/database";
import {
  buildMetaVehicleCatalogCsv,
  toMetaVehicleCatalogRow,
  validateMetaVehicleRow,
} from "@okauto/shared";
import { onSaleInventoryWhere } from "@/lib/on-sale-query";
import { computeQuebecAdvertisedPrice, mergePricingFees } from "@okauto/shared";

/**
 * In-memory limiter: 60 requests / hour / feed token.
 * Fine for a single web instance (Meta AIA typically polls one URL).
 * Multi-instance deploys would need a shared store (Redis).
 */
const hits = new Map<string, { count: number; resetAt: number }>();

function allowToken(token: string): boolean {
  const now = Date.now();
  const current = hits.get(token);
  if (!current || current.resetAt < now) {
    hits.set(token, { count: 1, resetAt: now + 60 * 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 60;
}

const empty404 = new Response("Not found", { status: 404 });

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token || token.length < 16) return empty404;

  const organization = await prisma.organization.findUnique({
    where: { metaCatalogFeedToken: token },
  });
  if (!organization || !organization.metaCatalogFeedEnabled) {
    return empty404;
  }
  if (!allowToken(token)) {
    return new Response("Too many requests", { status: 429 });
  }

  const vehicles = await prisma.vehicle.findMany({
    where: {
      organizationId: organization.id,
      ...(await onSaleInventoryWhere(organization.id)),
    },
    include: { photos: { orderBy: { sortOrder: "asc" }, take: 20 } },
  });

  const dealer = {
    name: organization.name,
    phone: organization.phone,
    website: organization.website,
    address: organization.address,
    city: organization.city,
    state: organization.state,
    zip: organization.zip,
    metaCatalogStateForDemo: organization.metaCatalogStateForDemo,
  };

  const catalogVehicles = vehicles.map((vehicle) => {
    const advertised = computeQuebecAdvertisedPrice(
      vehicle.price == null ? null : Number(vehicle.price),
      mergePricingFees(
        {
          freightFee: Number(organization.freightFee ?? 0),
          pdiFee: Number(organization.pdiFee ?? 0),
          adminFee: Number(organization.adminFee ?? 0),
          acExciseFee: Number(organization.acExciseFee ?? 0),
        },
        {
          freightFee: vehicle.freightFee == null ? null : Number(vehicle.freightFee),
          pdiFee: vehicle.pdiFee == null ? null : Number(vehicle.pdiFee),
          adminFee: vehicle.adminFee == null ? null : Number(vehicle.adminFee),
          acExciseFee:
            vehicle.acExciseFee == null ? null : Number(vehicle.acExciseFee),
        },
      ),
    );
    return {
      id: vehicle.id,
      vin: vehicle.vin,
      stockNumber: vehicle.stockNumber,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      mileage: vehicle.mileage,
      advertisedPrice: advertised?.advertisedPrice ?? null,
      price: vehicle.price == null ? null : Number(vehicle.price),
      bodyStyle: vehicle.bodyStyle,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      condition: vehicle.condition,
      description: vehicle.description,
      sourceUrl: vehicle.sourceUrl,
      imageUrls: vehicle.photos.map((photo) => photo.url),
      status: vehicle.status,
      transmission: vehicle.transmission,
      fuelType: vehicle.fuelType,
      drivetrain: vehicle.drivetrain,
      createdAt: vehicle.createdAt,
    };
  });

  const included = catalogVehicles.filter((vehicle) => {
    const row = toMetaVehicleCatalogRow(vehicle, dealer);
    return validateMetaVehicleRow(row).excluded.length === 0;
  });

  const csv = buildMetaVehicleCatalogCsv(included, dealer);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
