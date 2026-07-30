import { prisma } from '@okauto/database';
import { withAuth, jsonResponse } from '@/lib/api';

export const GET = withAuth(async (request, { auth }) => {
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === 'true';

  const where: Record<string, unknown> = { userId: auth.sub };
  if (unreadOnly) where.isRead = false;

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: auth.sub, isRead: false },
  });

  return jsonResponse({ notifications, unreadCount });
});
