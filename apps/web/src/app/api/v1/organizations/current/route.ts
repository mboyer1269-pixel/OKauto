import { prisma } from '@okauto/database';
import { updateOrganizationSchema } from '@okauto/shared';
import { withAuth, jsonResponse, parseBody } from '@/lib/api';

export const GET = withAuth(async (_request, { auth }) => {
  const org = await prisma.organization.findUnique({
    where: { id: auth.orgId },
    include: {
      _count: { select: { members: true, vehicles: true, listings: true } },
    },
  });
  return jsonResponse(org);
});

export const PATCH = withAuth(
  async (request, { auth }) => {
    const body = await parseBody<unknown>(request);
    const data = updateOrganizationSchema.parse(body);

    const org = await prisma.organization.update({
      where: { id: auth.orgId },
      data,
    });

    return jsonResponse(org);
  },
  { minRole: 'ADMIN' }
);
