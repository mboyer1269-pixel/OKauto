import { prisma } from '@okauto/database';
import { ApiErrorCode } from '@okauto/shared';
import { withAuth, jsonResponse, apiError } from '@/lib/api';

export const DELETE = withAuth(async (_request, { auth, params }) => {
  const key = await prisma.apiKey.findFirst({
    where: {
      id: params!.id,
      organizationId: auth.orgId,
      userId: auth.sub,
    },
  });
  if (!key) return apiError(ApiErrorCode.API_KEY_NOT_FOUND, 404);

  await prisma.apiKey.update({
    where: { id: params!.id },
    data: { isActive: false },
  });

  return jsonResponse({ success: true });
});
