import { prisma } from '@okauto/db';
import { descriptionRequestSchema, generateDescription, normalizeVehicle } from '@okauto/shared';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { resolveDescriptionProvider } from '@/lib/ai';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) throw httpErrors.notFound('Vehicle not found');
  const orgCtx = await requireOrgContext(user, vehicle.organizationId);
  // Salespeople can generate descriptions (they create listings).
  assertCan(orgCtx, 'listing:create');

  const input = await parseJson(req, descriptionRequestSchema);
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

  const result = await generateDescription(
    normalized,
    {
      tone: input.tone,
      includePrice: input.includePrice,
      includeCallToAction: input.includeCallToAction,
      maxLength: input.maxLength,
      dealershipName: org?.name,
    },
    { provider: resolveDescriptionProvider() },
  );

  await audit({
    organizationId: vehicle.organizationId,
    actorId: user.id,
    action: 'vehicle.description.generate',
    targetType: 'vehicle',
    targetId: id,
    metadata: { provider: result.provider, policyOk: result.policy.ok },
    ip: clientIp(req),
  });

  return jsonOk(result);
});
