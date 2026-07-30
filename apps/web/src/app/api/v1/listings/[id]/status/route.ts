import { prisma, type ListingEventType, type Prisma } from '@okauto/db';
import { canAct, updateListingStatusSchema } from '@okauto/shared';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { requireOrgContext } from '@/lib/context';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const EVENT_FOR_STATUS: Record<string, ListingEventType> = {
  PENDING: 'PREFILLED',
  ACTIVE: 'ACTIVATED',
  REMOVED: 'REMOVED',
  SOLD: 'SOLD_DETECTED',
  FAILED: 'FAILED',
};

export const POST = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) throw httpErrors.notFound('Listing not found');
  const orgCtx = await requireOrgContext(user, listing.organizationId);
  const isOwner = listing.listerId === user.id;
  if (!canAct(orgCtx.role, 'listing:update', isOwner)) {
    throw httpErrors.forbidden('You cannot update this listing');
  }

  const input = await parseJson(req, updateListingStatusSchema);
  const data: Prisma.ListingUpdateInput = { status: input.status };
  if (input.externalUrl) data.externalUrl = input.externalUrl;
  if (input.status === 'ACTIVE') data.activatedAt = new Date();
  if (input.status === 'REMOVED') data.removedAt = new Date();
  if (input.status === 'PENDING') data.prefilledAt = new Date();

  const eventType = EVENT_FOR_STATUS[input.status] ?? 'NOTE';
  const updated = await prisma.listing.update({
    where: { id },
    data: {
      ...data,
      events: {
        create: [{ type: eventType, message: input.note ?? `Status set to ${input.status}` }],
      },
    },
  });

  await audit({
    organizationId: listing.organizationId,
    actorId: user.id,
    action: 'listing.status',
    targetType: 'listing',
    targetId: id,
    metadata: { status: input.status },
    ip: clientIp(req),
  });
  return jsonOk({ id: updated.id, status: updated.status });
});
