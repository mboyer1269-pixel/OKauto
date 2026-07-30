import { prisma, type Prisma } from '@okauto/db';
import { normalizeVehicle, updateVehicleSchema } from '@okauto/shared';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function loadVehicle(id: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { position: 'asc' } },
      listings: { orderBy: { createdAt: 'desc' }, include: { lister: { select: { id: true, name: true } } } },
    },
  });
  if (!vehicle) throw httpErrors.notFound('Vehicle not found');
  return vehicle;
}

export const GET = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const vehicle = await loadVehicle(id);
  const orgCtx = await requireOrgContext(user, vehicle.organizationId);
  assertCan(orgCtx, 'vehicle:read');
  return jsonOk(vehicle);
});

export const PATCH = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) throw httpErrors.notFound('Vehicle not found');
  const orgCtx = await requireOrgContext(user, existing.organizationId);
  assertCan(orgCtx, 'vehicle:update');

  const input = await parseJson(req, updateVehicleSchema);
  const merged = normalizeVehicle({
    vin: input.vin ?? existing.vin,
    stockNumber: input.stockNumber ?? existing.stockNumber,
    category: input.category ?? existing.category,
    year: input.year ?? existing.year,
    make: input.make ?? existing.make,
    model: input.model ?? existing.model,
    trim: input.trim ?? existing.trim,
    bodyStyle: input.bodyStyle ?? existing.bodyStyle,
    mileage: input.mileage ?? existing.mileage,
    price: input.price,
    priceCents: input.price === undefined ? existing.priceCents : undefined,
    exteriorColor: input.exteriorColor ?? existing.exteriorColor,
    interiorColor: input.interiorColor ?? existing.interiorColor,
    fuelType: input.fuelType ?? existing.fuelType,
    transmission: input.transmission ?? existing.transmission,
    drivetrain: input.drivetrain ?? existing.drivetrain,
    engine: input.engine ?? existing.engine,
    features: input.features ?? existing.features,
    condition: input.condition ?? existing.condition,
  });

  const data: Prisma.VehicleUpdateInput = {
    vin: merged.vin,
    stockNumber: merged.stockNumber,
    category: merged.category,
    year: merged.year,
    make: merged.make,
    model: merged.model,
    trim: merged.trim,
    bodyStyle: merged.bodyStyle,
    mileage: merged.mileage,
    priceCents: merged.priceCents,
    exteriorColor: merged.exteriorColor,
    interiorColor: merged.interiorColor,
    fuelType: merged.fuelType ?? undefined,
    transmission: merged.transmission ?? undefined,
    drivetrain: merged.drivetrain,
    engine: merged.engine,
    condition: merged.condition,
    features: merged.features,
    title: merged.title,
    status: input.status,
  };

  const vehicle = await prisma.vehicle.update({ where: { id }, data, include: { photos: true } });
  await audit({
    organizationId: existing.organizationId,
    actorId: user.id,
    action: 'vehicle.update',
    targetType: 'vehicle',
    targetId: id,
    ip: clientIp(req),
  });
  return jsonOk(vehicle);
});

export const DELETE = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) throw httpErrors.notFound('Vehicle not found');
  const orgCtx = await requireOrgContext(user, existing.organizationId);
  assertCan(orgCtx, 'vehicle:delete');
  await prisma.vehicle.delete({ where: { id } });
  await audit({
    organizationId: existing.organizationId,
    actorId: user.id,
    action: 'vehicle.delete',
    targetType: 'vehicle',
    targetId: id,
    ip: clientIp(req),
  });
  return jsonOk({ ok: true });
});
