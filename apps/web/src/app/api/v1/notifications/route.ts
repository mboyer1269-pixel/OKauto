import { prisma } from '@okauto/db';
import { handler, jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unread') === '1';
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });
  return jsonOk({ notifications, unreadCount });
});
