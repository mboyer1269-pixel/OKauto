import { prisma, type Prisma } from '@okauto/db';
import { normalizeVehicle, vehicleInputSchema } from '@okauto/shared';
import { handler, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { normalizedToCreateData } from '@/lib/services/vehicles';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'vehicle:read');

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  const status = url.searchParams.get('status')?.trim();
  const take = Math.min(Number.parseInt(url.searchParams.get('take') ?? '50', 10) || 50, 200);
  const skip = Math.max(Number.parseInt(url.searchParams.get('skip') ?? '0', 10) || 0, 0);

  const where: Prisma.VehicleWhereInput = { organizationId: id };
  if (status) where.status = status as Prisma.VehicleWhereInput['status'];
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { vin: { contains: q, mode: 'insensitive' } },
      { stockNumber: { contains: q, mode: 'insensitive' } },
      { make: { contains: q, mode: 'insensitive' } },
      { model: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: { photos: { orderBy: { position: 'asc' } }, _count: { select: { listings: true } } },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return jsonOk({ items, total, take, skip });
});

export const POST = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'vehicle:create');

  const input = await parseJson(req, vehicleInputSchema);
  const normalized = normalizeVehicle(input);
  const data = normalizedToCreateData(id, normalized);
  if (input.photoUrls?.length) {
    data.photos = { create: input.photoUrls.map((url, i) => ({ url, position: i })) };
  }
  const vehicle = await prisma.vehicle.create({ data, include: { photos: true } });
  await audit({
    organizationId: id,
    actorId: user.id,
    action: 'vehicle.create',
    targetType: 'vehicle',
    targetId: vehicle.id,
    ip: clientIp(req),
  });
  return jsonOk(vehicle, { status: 201 });
});
