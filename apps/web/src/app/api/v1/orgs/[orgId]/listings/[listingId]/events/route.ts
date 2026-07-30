import { prisma } from "@lotpilot/db";
import { z } from "zod";
import { handler, json, notFound, parseBody, requireOrgRole } from "@/server/api";

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
  });
  if (!listing) throw notFound("Listing not found");
  const events = await prisma.listingEvent.findMany({
    where: { listingId },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { id: true, name: true } } },
  });
  return json({ events });
});

const createSchema = z.object({
  type: z.enum(["NOTE", "FILL_ASSIST_USED", "PRICE_UPDATED"]),
  data: z.record(z.unknown()).default({}),
});

export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId, listingId } = await ctx.params;
  const { user, membership } = await requireOrgRole(req, orgId);
  const body = await parseBody(req, createSchema);
  const listing = await prisma.listing.findFirst({
    where: {
      id: listingId,
      organizationId: orgId,
      ...(membership.role === "SALESPERSON" ? { userId: user.id } : {}),
    },
  });
  if (!listing) throw notFound("Listing not found");
  const event = await prisma.listingEvent.create({
    data: {
      listingId,
      actorId: user.id,
      type: body.type,
      data: JSON.parse(JSON.stringify(body.data)),
    },
  });
  return json({ event }, { status: 201 });
});
