import { randomBytes } from "crypto";
import { prisma } from "@okauto/database";
import { withAuth, jsonResponse, errorResponse, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";
import { previewMetaCatalog } from "@/lib/sales-ops";

function newToken() {
  return randomBytes(32).toString("base64url");
}

function hasAddress(org: {
  address: string | null;
  city: string | null;
  state: string | null;
}) {
  return Boolean(org.address && org.city && org.state);
}

export const GET = withAuth(
  async (_request, { auth }) => {
    const organization = await prisma.organization.findUnique({
      where: { id: auth.orgId },
    });
    if (!organization) return errorResponse("Concession introuvable", 404);
    const preview = await previewMetaCatalog(auth.orgId);
    return jsonResponse({
      enabled: organization.metaCatalogFeedEnabled,
      tokenPresent: Boolean(organization.metaCatalogFeedToken),
      feedUrl: organization.metaCatalogFeedToken
        ? `/api/feeds/meta/${organization.metaCatalogFeedToken}/vehicles.csv`
        : null,
      allInConfirmed: Boolean(organization.allInPriceConfirmedAt),
      addressReady: hasAddress(organization),
      metaCatalogStateForDemo: organization.metaCatalogStateForDemo,
      preview,
    });
  },
  { minRole: "ADMIN" },
);

export const POST = withAuth(
  async (request, { auth }) => {
    const body = (await parseBody<{
      action?: "enable" | "disable" | "rotate";
    }>(request)) ?? {};
    const organization = await prisma.organization.findUnique({
      where: { id: auth.orgId },
    });
    if (!organization) return errorResponse("Concession introuvable", 404);

    if (body.action === "enable") {
      if (!organization.allInPriceConfirmedAt || !hasAddress(organization)) {
        return errorResponse(
          "Pour activer le flux, confirmez d'abord les prix tout inclus et complétez l'adresse de la concession.",
          409,
        );
      }
      const updated = await prisma.organization.update({
        where: { id: auth.orgId },
        data: {
          metaCatalogFeedEnabled: true,
          metaCatalogFeedToken: organization.metaCatalogFeedToken ?? newToken(),
        },
      });
      await createAuditLog({
        organizationId: auth.orgId,
        userId: auth.sub,
        action: "UPDATE",
        entityType: "meta_catalog",
        entityId: auth.orgId,
        metadata: { action: "enable" },
        request: request as never,
      });
      return jsonResponse({
        enabled: true,
        feedUrl: `/api/feeds/meta/${updated.metaCatalogFeedToken}/vehicles.csv`,
      });
    }

    if (body.action === "rotate") {
      const updated = await prisma.organization.update({
        where: { id: auth.orgId },
        data: { metaCatalogFeedToken: newToken() },
      });
      await createAuditLog({
        organizationId: auth.orgId,
        userId: auth.sub,
        action: "UPDATE",
        entityType: "meta_catalog",
        entityId: auth.orgId,
        metadata: { action: "rotate" },
        request: request as never,
      });
      return jsonResponse({
        enabled: updated.metaCatalogFeedEnabled,
        feedUrl: `/api/feeds/meta/${updated.metaCatalogFeedToken}/vehicles.csv`,
      });
    }

    await prisma.organization.update({
      where: { id: auth.orgId },
      data: { metaCatalogFeedEnabled: false },
    });
    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: "UPDATE",
      entityType: "meta_catalog",
      entityId: auth.orgId,
      metadata: { action: "disable" },
      request: request as never,
    });
    return jsonResponse({ enabled: false });
  },
  { minRole: "ADMIN" },
);
