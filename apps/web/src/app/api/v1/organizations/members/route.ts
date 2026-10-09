import { prisma } from "@okauto/database";
import { inviteMemberSchema } from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import {
  MEMBER_CREATE_CONFLICT_MESSAGE,
  dealerMayResetMemberPassword,
} from "@/lib/member-provisioning";

export const GET = withAuth(async (_request, { auth }) => {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: auth.orgId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          provisionedByOrganizationId: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: { in: members.map((member) => member.userId) } },
    select: { userId: true, organizationId: true },
  });
  const membershipsByUser = new Map<string, string[]>();
  for (const row of memberships) {
    const current = membershipsByUser.get(row.userId) ?? [];
    current.push(row.organizationId);
    membershipsByUser.set(row.userId, current);
  }

  return jsonResponse(
    members.map((member) => ({
      ...member,
      passwordResetAllowed: dealerMayResetMemberPassword({
        organizationId: auth.orgId,
        provisionedByOrganizationId: member.user.provisionedByOrganizationId,
        membershipOrganizationIds: membershipsByUser.get(member.userId) ?? [],
      }),
    })),
  );
});

export const POST = withAuth(
  async (request, { auth }) => {
    const body = await parseBody<unknown>(request);
    const data = inviteMemberSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (existing) {
      return errorResponse(MEMBER_CREATE_CONFLICT_MESSAGE, 409);
    }

    const passwordHash = await hashPassword(data.password);
    try {
      const member = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: data.email,
            passwordHash,
            name: data.name,
            provisionedByOrganizationId: auth.orgId,
          },
        });
        return tx.organizationMember.create({
          data: {
            organizationId: auth.orgId,
            userId: user.id,
            role: data.role,
          },
          include: { user: { select: { id: true, email: true, name: true } } },
        });
      });

      return jsonResponse({ ...member, temporaryPasswordCreated: true }, 201);
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        return errorResponse(MEMBER_CREATE_CONFLICT_MESSAGE, 409);
      }
      throw err;
    }
  },
  { minRole: "ADMIN" },
);
