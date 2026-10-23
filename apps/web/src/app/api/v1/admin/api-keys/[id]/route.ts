import { prisma } from '@okauto/database';
import { ApiErrorCode } from '@okauto/shared';
import { withAuth, jsonResponse, apiError } from '@/lib/api';
import { createAuditLog } from '@/lib/auth';

export const DELETE = withAuth(async (request, { auth, params }) => {
  const key = await prisma.apiKey.findFirst({
    where: {
      id: params!.id,
      organizationId: auth.orgId,
      userId: auth.sub,
    },
  });
  if (!key) return apiError(ApiErrorCode.API_KEY_NOT_FOUND, 404);

  const revokedAt = key.revokedAt ?? new Date();
  await prisma.apiKey.update({
    where: { id: params!.id },
    data: { isActive: false, revokedAt },
  });

  await createAuditLog({
    organizationId: auth.orgId,
    userId: auth.sub,
    action: 'UPDATE',
    entityType: 'api_key',
    entityId: key.id,
    metadata: {
      action: 'revoke',
      keyPrefix: key.keyPrefix,
      name: key.name,
      revokedAt: revokedAt.toISOString(),
    },
    request: request as never,
  });

  return jsonResponse({ success: true, revokedAt });
});
