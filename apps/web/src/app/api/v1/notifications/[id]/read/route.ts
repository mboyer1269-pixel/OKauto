import { prisma } from '@okauto/database';
import { ApiErrorCode } from '@okauto/shared';
import { withAuth, jsonResponse, apiError } from '@/lib/api';

export const PATCH = withAuth(async (_request, { auth, params }) => {
  const notification = await prisma.notification.findFirst({
    where: { id: params!.id, userId: auth.sub },
  });
  if (!notification) return apiError(ApiErrorCode.NOTIFICATION_NOT_FOUND, 404);

  const updated = await prisma.notification.update({
    where: { id: params!.id },
    data: { isRead: true, readAt: new Date() },
  });

  return jsonResponse(updated);
});
