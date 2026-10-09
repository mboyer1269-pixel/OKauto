import bcrypt from "bcryptjs";
import { prisma } from "@okauto/database";
import { inviteMemberSchema } from "@okauto/shared";
import { withAuth, jsonResponse, parseBody } from "@/lib/api";
import { createAuditLog, generateInviteToken, hashToken } from "@/lib/auth";
import {
  INVITE_DUMMY_PASSWORD_HASH,
  INVITE_TTL_MS,
  MEMBER_INVITE_NOTICE,
  dealerMayResetMemberPassword,
  inviteUrlFor,
} from "@/lib/member-provisioning";
import { enforceMemberInviteRateLimit } from "@/lib/rate-limit";

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
    const limited = await enforceMemberInviteRateLimit(auth.orgId);
    if (limited) return limited;

    const body = await parseBody<unknown>(request);
    const data = inviteMemberSchema.parse(body);

    const token = generateInviteToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await Promise.all([
      prisma.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      }),
      bcrypt.compare("invite", INVITE_DUMMY_PASSWORD_HASH),
    ]);

    const invite = await prisma.$transaction(async (tx) => {
      await tx.organizationInvite.updateMany({
        where: {
          organizationId: auth.orgId,
          email: data.email,
          consumedAt: null,
        },
        data: { consumedAt: new Date() },
      });
      return tx.organizationInvite.create({
        data: {
          organizationId: auth.orgId,
          email: data.email,
          name: data.name,
          role: data.role,
          tokenHash,
          expiresAt,
          invitedById: auth.sub,
        },
      });
    });

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: "INVITE",
      entityType: "organization_invite",
      entityId: invite.id,
      request: request as never,
    });

    return jsonResponse(
      {
        id: invite.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        inviteUrl: inviteUrlFor(token),
        emailDelivery: "none",
        notice: MEMBER_INVITE_NOTICE,
      },
      201,
    );
  },
  { minRole: "ADMIN" },
);
