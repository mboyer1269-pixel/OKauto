import { prisma } from '@okauto/database';
import { withAuth, jsonResponse } from '@/lib/api';

export const POST = withAuth(async (_request, { auth }) => {
  await prisma.notification.updateMany({
    where: { userId: auth.sub, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return jsonResponse({ success: true });
});
