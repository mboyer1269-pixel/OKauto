import { prisma } from '@okauto/database';
import { updateMemberSchema } from '@okauto/shared';
import { withAuth, jsonResponse, errorResponse, parseBody } from '@/lib/api';

export const PATCH = withAuth(
  async (request, { auth, params }) => {
    const body = await parseBody<unknown>(request);
    const data = updateMemberSchema.parse(body);

    const member = await prisma.organizationMember.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!member) return errorResponse('Member not found', 404);
    if (member.role === 'OWNER' && data.role && data.role !== 'OWNER') {
      return errorResponse('Cannot change owner role', 400);
    }

    const updated = await prisma.organizationMember.update({
      where: { id: params!.id },
      data: { role: data.role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    return jsonResponse(updated);
  },
  { minRole: 'ADMIN' }
);

export const DELETE = withAuth(
  async (_request, { auth, params }) => {
    const member = await prisma.organizationMember.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!member) return errorResponse('Member not found', 404);
    if (member.role === 'OWNER') return errorResponse('Cannot remove owner', 400);

    await prisma.organizationMember.delete({ where: { id: params!.id } });
    return jsonResponse({ success: true });
  },
  { minRole: 'ADMIN' }
);
