import { prisma } from "@okauto/database";
import { ApiErrorCode, hasMinRole, updateMemberSchema } from "@okauto/shared";
import { withAuth, jsonResponse, apiError, errorResponse, parseBody } from "@/lib/api";
import { createAuditLog, hashPassword } from "@/lib/auth";
import {
  MEMBER_PASSWORD_RESET_FORBIDDEN_MESSAGE,
  dealerMayResetMemberPassword,
} from "@/lib/member-provisioning";

export const PATCH = withAuth(
  async (request, { auth, params }) => {
    const body = await parseBody<unknown>(request);
    const data = updateMemberSchema.parse(body);

    const member = await prisma.organizationMember.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
      include: {
        user: {
          select: { id: true, provisionedByOrganizationId: true },
        },
      },
    });
    if (!member) return apiError(ApiErrorCode.MEMBER_NOT_FOUND, 404);
    if (member.role === "OWNER" && data.role && data.role !== "OWNER") {
      return apiError(ApiErrorCode.CANNOT_CHANGE_OWNER_ROLE, 400);
    }
    if (data.role && !hasMinRole(auth.role, "ADMIN") && data.role !== member.role) {
      return errorResponse("Seul un administrateur peut changer le rôle", 403);
    }

    let passwordUpdated = false;
    if (data.password) {
      if (!hasMinRole(auth.role, "ADMIN")) {
        return errorResponse(
          "Seul un administrateur peut réinitialiser un mot de passe",
          403,
        );
      }
      if (member.role === "OWNER" && auth.role !== "OWNER") {
        return apiError(ApiErrorCode.ONLY_OWNER_CAN_RESET_OWNER, 403);
      }

      const memberships = await prisma.organizationMember.findMany({
        where: { userId: member.userId },
        select: { organizationId: true },
      });
      if (
        !dealerMayResetMemberPassword({
          organizationId: auth.orgId,
          provisionedByOrganizationId: member.user.provisionedByOrganizationId,
          membershipOrganizationIds: memberships.map(
            (row) => row.organizationId,
          ),
        })
      ) {
        return errorResponse(MEMBER_PASSWORD_RESET_FORBIDDEN_MESSAGE, 403);
      }

      const passwordHash = await hashPassword(data.password);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: member.userId },
          data: {
            passwordHash,
            isActive: true,
            sessionInvalidatedAt: new Date(),
          },
        }),
        prisma.refreshToken.deleteMany({ where: { userId: member.userId } }),
      ]);
      passwordUpdated = true;
    }

    const updated = await prisma.organizationMember.update({
      where: { id: params!.id },
      data: {
        role: data.role,
        marketplaceMonthlyVehicleLimit: data.marketplaceMonthlyVehicleLimit,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, isActive: true },
        },
      },
    });

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: "UPDATE",
      entityType: "organization_member",
      entityId: member.id,
      metadata: {
        roleChanged: Boolean(data.role),
        passwordReset: passwordUpdated,
      },
      request: request as never,
    });

    return jsonResponse({ ...updated, passwordUpdated });
  },
  { minRole: "MANAGER" },
);

export const DELETE = withAuth(
  async (_request, { auth, params }) => {
    const member = await prisma.organizationMember.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!member) return apiError(ApiErrorCode.MEMBER_NOT_FOUND, 404);
    if (member.role === "OWNER")
      return apiError(ApiErrorCode.CANNOT_REMOVE_OWNER, 400);

    await prisma.organizationMember.delete({ where: { id: params!.id } });
    return jsonResponse({ success: true });
  },
  { minRole: "ADMIN" },
);
