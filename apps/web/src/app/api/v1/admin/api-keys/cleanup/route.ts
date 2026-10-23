import { prisma } from "@okauto/database";
import { withAuth, jsonResponse } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const POST = withAuth(async (request, { auth }) => {
  const revoked = await prisma.apiKey.findMany({
    where: {
      organizationId: auth.orgId,
      userId: auth.sub,
      OR: [{ revokedAt: { not: null } }, { isActive: false }],
    },
    select: { id: true, keyPrefix: true, name: true },
  });

  if (revoked.length > 0) {
    await prisma.apiKey.deleteMany({
      where: { id: { in: revoked.map((key) => key.id) } },
    });
    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: "DELETE",
      entityType: "api_key",
      metadata: {
        action: "cleanup_revoked",
        deleted: revoked.map((key) => ({
          id: key.id,
          keyPrefix: key.keyPrefix,
          name: key.name,
        })),
      },
      request: request as never,
    });
  }

  return jsonResponse({ success: true, deleted: revoked.length });
});
