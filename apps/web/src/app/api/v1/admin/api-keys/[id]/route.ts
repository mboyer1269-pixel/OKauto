import { prisma } from '@okauto/database';
import { withAuth, jsonResponse, errorResponse } from '@/lib/api';

export const DELETE = withAuth(async (_request, { auth, params }) => {
  const key = await prisma.apiKey.findFirst({
    where: {
      id: params!.id,
      organizationId: auth.orgId,
      userId: auth.sub,
    },
  });
  if (!key) return errorResponse('API key not found', 404);

  await prisma.apiKey.update({
    where: { id: params!.id },
    data: { isActive: false },
  });

  return jsonResponse({ success: true });
});
