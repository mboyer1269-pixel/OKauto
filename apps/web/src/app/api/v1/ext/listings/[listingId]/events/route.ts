import { prisma } from "@lotpilot/db";
import { z } from "zod";
import { handler, json, notFound, parseBody, requireApiToken } from "@/server/api";

type Ctx = { params: Promise<{ listingId: string }> };

const schema = z.object({
  type: z.enum(["FILL_ASSIST_USED", "NOTE", "ERROR"]),
  data: z.record(z.unknown()).default({}),
});

/** Extension telemetry: field-fill assists, selector-drift reports, notes. */
export const POST = handler<Ctx>(async (req, ctx) => {
  const auth = await requireApiToken(req);
  const { listingId } = await ctx.params;
  const body = await parseBody(req, schema);

  const listing = await prisma.listing.findFirst({
    where: { id: listingId, organizationId: auth.organizationId, userId: auth.user.id },
  });
  if (!listing) throw notFound("Listing not found");

  const event = await prisma.listingEvent.create({
    data: {
      listingId,
      actorId: auth.user.id,
      type: body.type,
      data: JSON.parse(JSON.stringify(body.data)),
    },
  });
  return json({ event }, { status: 201 });
});
