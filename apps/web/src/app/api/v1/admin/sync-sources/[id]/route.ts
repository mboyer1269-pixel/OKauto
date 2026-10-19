import { prisma } from "@okauto/database";
import { ApiErrorCode, updateSyncSourceSchema } from "@okauto/shared";
import { withAuth, jsonResponse, apiError, parseBody } from "@/lib/api";
import { createAuditLog } from "@/lib/auth";

export const GET = withAuth(async (_request, { auth, params }) => {
  const source = await prisma.syncSource.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
  });
  if (!source) return apiError(ApiErrorCode.SYNC_SOURCE_NOT_FOUND, 404);
  return jsonResponse(source);
});

export const PATCH = withAuth(
  async (request, { auth, params }) => {
    const existing = await prisma.syncSource.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!existing) return apiError(ApiErrorCode.SYNC_SOURCE_NOT_FOUND, 404);

    const body = await parseBody<unknown>(request);
    const data = updateSyncSourceSchema.parse(body);

    const source = await prisma.syncSource.update({
      where: { id: params!.id },
      data: {
        name: data.name,
        url: data.url,
        adapter: data.adapter,
        isActive: data.isActive,
        intervalMinutes: data.intervalMinutes,
      },
    });

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: "UPDATE",
      entityType: "sync_source",
      entityId: source.id,
      metadata: { changes: data },
      request: request as never,
    });

    return jsonResponse(source);
  },
  { minRole: "MANAGER" },
);

export const DELETE = withAuth(
  async (request, { auth, params }) => {
    const existing = await prisma.syncSource.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!existing) return apiError(ApiErrorCode.SYNC_SOURCE_NOT_FOUND, 404);

    await prisma.syncSource.delete({ where: { id: params!.id } });

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: "DELETE",
      entityType: "sync_source",
      entityId: params!.id,
      request: request as never,
    });

    return jsonResponse({ success: true });
  },
  { minRole: "MANAGER" },
);
