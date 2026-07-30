import { LISTING_STATUSES } from "@lotpilot/core";
import { z } from "zod";
import { audit, handler, json, parseBody, requireApiToken } from "@/server/api";
import { transitionListing } from "@/server/listings";

type Ctx = { params: Promise<{ listingId: string }> };

const schema = z.object({
  status: z.enum(LISTING_STATUSES),
  externalUrl: z.string().url().optional().nullable(),
  errorMessage: z.string().max(500).optional().nullable(),
});

/**
 * Extension: record a status change the human performed on Marketplace
 * (posted with URL, delisted, error). Restricted to the token owner's listings.
 */
export const POST = handler<Ctx>(async (req, ctx) => {
  const auth = await requireApiToken(req);
  const { listingId } = await ctx.params;
  const body = await parseBody(req, schema);

  const listing = await transitionListing({
    listingId,
    organizationId: auth.organizationId,
    actorId: auth.user.id,
    restrictToUserId: auth.user.id,
    status: body.status,
    externalUrl: body.externalUrl,
    errorMessage: body.errorMessage,
  });
  await audit(req, {
    organizationId: auth.organizationId,
    userId: auth.user.id,
    action: `listing.${body.status.toLowerCase()}`,
    entityType: "listing",
    entityId: listingId,
    data: { via: "extension" },
  });
  return json({ listing });
});
