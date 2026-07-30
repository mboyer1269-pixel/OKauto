import { prisma } from '@okauto/database';
import { createSyncSourceSchema } from '@okauto/shared';
import { withAuth, jsonResponse, parseBody } from '@/lib/api';
import { createAuditLog } from '@/lib/auth';

export const GET = withAuth(async (_request, { auth }) => {
  const sources = await prisma.syncSource.findMany({
    where: { organizationId: auth.orgId },
    orderBy: { name: 'asc' },
  });
  return jsonResponse({ sources });
});

export const POST = withAuth(
  async (request, { auth }) => {
    const body = await parseBody<unknown>(request);
    const data = createSyncSourceSchema.parse(body);

    const source = await prisma.syncSource.create({
      data: {
        organizationId: auth.orgId,
        name: data.name,
        url: data.url,
        adapter: data.adapter,
        isActive: data.isActive ?? true,
        intervalMinutes: data.intervalMinutes,
      },
    });

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: 'CREATE',
      entityType: 'sync_source',
      entityId: source.id,
      request: request as never,
    });

    return jsonResponse(source, 201);
  },
  { minRole: 'MANAGER' }
);
