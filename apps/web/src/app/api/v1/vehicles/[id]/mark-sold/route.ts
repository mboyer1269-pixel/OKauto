import { prisma } from '@okauto/db';
import { handler, httpErrors, jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { markVehicleSold } from '@/lib/services/listings';
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

  const flagged = await markVehicleSold(id);
  await audit({
    organizationId: vehicle.organizationId,
    actorId: user.id,
    action: 'vehicle.mark_sold',
    targetType: 'vehicle',
    targetId: id,
    metadata: { listingsFlagged: flagged },
    ip: clientIp(req),
  });
  return jsonOk({ ok: true, listingsFlagged: flagged });
});
