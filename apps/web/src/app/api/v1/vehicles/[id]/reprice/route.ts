import { prisma } from '@okauto/db';
import { parsePriceToCents, repriceSchema } from '@okauto/shared';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { repriceVehicle } from '@/lib/services/listings';
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
  assertCan(orgCtx, 'vehicle:update');

  const input = await parseJson(req, repriceSchema);
  const cents = parsePriceToCents(input.price);
  if (cents === null || cents < 0) throw httpErrors.badRequest('Invalid price');

  const flagged = await repriceVehicle(id, cents);
  await audit({
    organizationId: vehicle.organizationId,
    actorId: user.id,
    action: 'vehicle.reprice',
    targetType: 'vehicle',
    targetId: id,
    metadata: { priceCents: cents, listingsFlagged: flagged },
    ip: clientIp(req),
  });
  return jsonOk({ ok: true, priceCents: cents, listingsFlagged: flagged });
});
