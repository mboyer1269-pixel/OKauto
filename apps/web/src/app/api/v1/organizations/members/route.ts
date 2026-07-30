import { prisma } from '@okauto/database';
import { inviteMemberSchema, updateMemberSchema } from '@okauto/shared';
import { withAuth, jsonResponse, errorResponse, parseBody } from '@/lib/api';
import { hashPassword } from '@/lib/auth';

export const GET = withAuth(async (_request, { auth }) => {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: auth.orgId },
    include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  return jsonResponse(members);
});

export const POST = withAuth(
  async (request, { auth }) => {
    const body = await parseBody<unknown>(request);
    const data = inviteMemberSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      const memberExists = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: auth.orgId, userId: existing.id } },
      });
      if (memberExists) return errorResponse('User is already a member', 409);
    }

    const passwordHash = await hashPassword(data.password);
    const user =
      existing ??
      (await prisma.user.create({
        data: { email: data.email, passwordHash, name: data.name },
      }));

    const member = await prisma.organizationMember.create({
      data: {
        organizationId: auth.orgId,
        userId: user.id,
        role: data.role,
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    return jsonResponse(member, 201);
  },
  { minRole: 'ADMIN' }
);
