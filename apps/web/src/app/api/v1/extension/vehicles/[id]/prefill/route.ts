import { prisma } from '@okauto/db';
import {
  FACEBOOK_MARKETPLACE_ADAPTER,
  generateDescription,
  mapVehicleToMarketplace,
  normalizeVehicle,
} from '@okauto/shared';
import { handler, httpErrors, jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { resolveDescriptionProvider } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Returns everything the content script needs to PRE-FILL (not submit) the Marketplace
 * vehicle composer: mapped fields, adapter selectors, description, and photo URLs.
 * A human always reviews and submits — no automated posting.
 */
export const GET = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { photos: { orderBy: { position: 'asc' } } },
  });
  if (!vehicle) throw httpErrors.notFound('Vehicle not found');
  const orgCtx = await requireOrgContext(user, vehicle.organizationId);
  assertCan(orgCtx, 'listing:create');

  const org = await prisma.organization.findUnique({ where: { id: vehicle.organizationId } });

  const normalized = normalizeVehicle({
    vin: vehicle.vin,
    stockNumber: vehicle.stockNumber,
    category: vehicle.category,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    bodyStyle: vehicle.bodyStyle,
    mileage: vehicle.mileage,
    priceCents: vehicle.priceCents,
    exteriorColor: vehicle.exteriorColor,
    interiorColor: vehicle.interiorColor,
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    drivetrain: vehicle.drivetrain,
    engine: vehicle.engine,
    features: vehicle.features,
    condition: vehicle.condition,
  });

  // Reuse an existing listing's description if present, else generate one.
  const existing = await prisma.listing.findFirst({
    where: { vehicleId: id, description: { not: '' } },
    orderBy: { updatedAt: 'desc' },
  });
  let description = existing?.description ?? '';
  if (!description) {
    const result = await generateDescription(
      normalized,
      { dealershipName: org?.name },
      { provider: resolveDescriptionProvider() },
    );
    description = result.body;
  }

  const photoUrls = vehicle.photos.map((p) => p.url);
  const fields = mapVehicleToMarketplace(normalized, description, photoUrls);

  return jsonOk({
    vehicle: { id: vehicle.id, title: vehicle.title },
    fields,
    photoUrls,
    adapter: FACEBOOK_MARKETPLACE_ADAPTER,
  });
});
