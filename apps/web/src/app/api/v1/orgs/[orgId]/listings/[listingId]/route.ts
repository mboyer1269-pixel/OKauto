import { LISTING_STATUSES } from "@lotpilot/core";
import { prisma } from "@lotpilot/db";
import { z } from "zod";
import { audit, handler, json, notFound, parseBody, requireOrgRole } from "@/server/api";
import { transitionListing } from "@/server/listings";

type Ctx = { params: Promise<{ orgId: string; listingId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId, listingId } = await ctx.params;
  const { user, membership } = await requireOrgRole(req, orgId);
  const listing = await prisma.listing.findFirst({
    where: {
      id: listingId,
      organizationId: orgId,
      ...(membership.role === "SALESPERSON" ? { userId: user.id } : {}),
    },
    include: {
      vehicle: { include: { photos: { orderBy: { position: "asc" } } } },
      user: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!listing) throw notFound("Listing not found");
  return json({ listing });
});

const patchSchema = z.object({
  status: z.enum(LISTING_STATUSES),
  externalUrl: z.string().url().optional().nullable(),
  errorMessage: z.string().max(500).optional().nullable(),
});

export const PATCH = handler<Ctx>(async (req, ctx) => {
  const { orgId, listingId } = await ctx.params;
  const { user, membership } = await requireOrgRole(req, orgId);
  const body = await parseBody(req, patchSchema);

  const listing = await transitionListing({
    listingId,
    organizationId: orgId,
    actorId: user.id,
    restrictToUserId: membership.role === "SALESPERSON" ? user.id : undefined,
    status: body.status,
    externalUrl: body.externalUrl,
    errorMessage: body.errorMessage,
  });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: `listing.${body.status.toLowerCase()}`,
    entityType: "listing",
    entityId: listingId,
  });
  return json({ listing });
});
