import { Prisma, prisma } from "@okauto/database";
import { updateOrganizationSchema } from "@okauto/shared";
import { withAuth, jsonResponse, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const GET = withAuth(async (_request, { auth }) => {
  const org = await prisma.organization.findUnique({
    where: { id: auth.orgId },
    include: {
      _count: { select: { members: true, vehicles: true, listings: true } },
    },
  });
  return jsonResponse(org);
});

export const PATCH = withAuth(
  async (request, { auth }) => {
    const body = await parseBody<unknown>(request);
    const parsed = updateOrganizationSchema.parse(body);
    const { confirmAllInPrice, listingHighlights, ...fields } = parsed;

    const org = await prisma.organization.update({
      where: { id: auth.orgId },
      data: {
        name: fields.name,
        website: fields.website,
        phone: fields.phone,
        address: fields.address,
        city: fields.city,
        state: fields.state,
        zip: fields.zip,
        monthlyListingLimit: fields.monthlyListingLimit,
        marketplaceMonthlyVehicleLimit: fields.marketplaceMonthlyVehicleLimit,
        listingRenewalDays: fields.listingRenewalDays,
        listingLocale: fields.listingLocale,
        listingLanguage: fields.listingLanguage,
        metaCatalogStateForDemo: fields.metaCatalogStateForDemo,
        freightFee: fields.freightFee ?? undefined,
        pdiFee: fields.pdiFee ?? undefined,
        adminFee: fields.adminFee ?? undefined,
        acExciseFee: fields.acExciseFee ?? undefined,
        includeCarfaxSourceUrl: fields.includeCarfaxSourceUrl,
        listingHighlights:
          listingHighlights === undefined
            ? undefined
            : listingHighlights === null
              ? Prisma.JsonNull
              : listingHighlights,
        ...(confirmAllInPrice === true
          ? {
              allInPriceConfirmedAt: new Date(),
              allInPriceConfirmedById: auth.sub,
            }
          : {}),
        ...(confirmAllInPrice === false
          ? {
              allInPriceConfirmedAt: null,
              allInPriceConfirmedById: null,
            }
          : {}),
      },
    });

    if (confirmAllInPrice !== undefined) {
      await createAuditLog({
        organizationId: auth.orgId,
        userId: auth.sub,
        action: "UPDATE",
        entityType: "organization",
        entityId: auth.orgId,
        metadata: { confirmAllInPrice },
        request: request as never,
      });
    }

    return jsonResponse(org);
  },
  { minRole: "ADMIN" },
);
