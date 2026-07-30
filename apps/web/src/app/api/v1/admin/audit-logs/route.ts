import { prisma } from '@okauto/database';
import { withAuth, jsonResponse } from '@/lib/api';

export const GET = withAuth(
  async (request, { auth }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { organizationId: auth.orgId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where: { organizationId: auth.orgId } }),
    ]);

    return jsonResponse({ logs, pagination: { page, limit, total } });
  },
  { minRole: 'ADMIN' }
);
