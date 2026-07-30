import { prisma } from '@okauto/db';
import { z } from 'zod';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  vehicleId: z.string().min(1),
  description: z.string().max(9000).optional(),
  descriptionProvider: z.string().max(32).optional(),
});

/**
 * Records that the extension has PRE-FILLED a Marketplace composer for a vehicle.
 * Creates (or reuses) a PENDING listing. The human then reviews and submits on FB;
 * the extension calls the status endpoint to mark it ACTIVE afterwards.
 */
export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const input = await parseJson(req, bodySchema);
  const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
  if (!vehicle) throw httpErrors.notFound('Vehicle not found');
  const orgCtx = await requireOrgContext(user, vehicle.organizationId);
  assertCan(orgCtx, 'listing:create');

  // Reuse an in-progress listing by this user for this vehicle if present.
  const existing = await prisma.listing.findFirst({
    where: {
      vehicleId: vehicle.id,
      listerId: user.id,
      status: { in: ['DRAFT', 'READY', 'PENDING'] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const listing = existing
    ? await prisma.listing.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          prefilledAt: new Date(),
          description: input.description ?? existing.description,
          descriptionProvider: input.descriptionProvider ?? existing.descriptionProvider,
          events: { create: [{ type: 'PREFILLED', message: 'Composer pre-filled by extension' }] },
        },
      })
    : await prisma.listing.create({
        data: {
          organizationId: vehicle.organizationId,
          vehicleId: vehicle.id,
          listerId: user.id,
          channel: 'FACEBOOK_MARKETPLACE',
          status: 'PENDING',
          prefilledAt: new Date(),
          description: input.description ?? '',
          descriptionProvider: input.descriptionProvider,
          priceCentsAtListing: vehicle.priceCents,
          events: { create: [{ type: 'PREFILLED', message: 'Composer pre-filled by extension' }] },
        },
      });

  await audit({
    organizationId: vehicle.organizationId,
    actorId: user.id,
    action: 'listing.prefill',
    targetType: 'listing',
    targetId: listing.id,
    metadata: { via: user.via },
    ip: clientIp(req),
  });

  return jsonOk({ id: listing.id, status: listing.status }, { status: 201 });
});
