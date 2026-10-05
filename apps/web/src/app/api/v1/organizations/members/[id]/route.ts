import { prisma } from "@okauto/database";
import { hasMinRole, updateMemberSchema } from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse, parseBody } from "@/lib/api";
import { createAuditLog, hashPassword } from "@/lib/auth";

export const PATCH = withAuth(
  async (request, { auth, params }) => {
    const body = await parseBody<unknown>(request);
    const data = updateMemberSchema.parse(body);

    const member = await prisma.organizationMember.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!member) return errorResponse("Member not found", 404);
    if (member.role === "OWNER" && data.role && data.role !== "OWNER") {
      return errorResponse("Cannot change owner role", 400);
    }
    if (member.role === "OWNER" && data.password && auth.role !== "OWNER") {
      return errorResponse("Only the owner can reset the owner account", 403);
    }

    if (data.password && !hasMinRole(auth.role, "ADMIN")) {
      return errorResponse("Seul un administrateur peut réinitialiser un mot de passe", 403);
    }
    if (data.role && !hasMinRole(auth.role, "ADMIN") && data.role !== member.role) {
      return errorResponse("Seul un administrateur peut changer le rôle", 403);
    }

    const passwordHash = data.password
      ? await hashPassword(data.password)
      : undefined;

    if (passwordHash) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: member.userId },
          data: { passwordHash, isActive: true },
        }),
        prisma.refreshToken.deleteMany({ where: { userId: member.userId } }),
      ]);
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
        passwordReset: Boolean(passwordHash),
      },
      request: request as never,
    });

    return jsonResponse({ ...updated, passwordUpdated: Boolean(passwordHash) });
  },
  { minRole: "MANAGER" },
);

export const DELETE = withAuth(
  async (_request, { auth, params }) => {
    const member = await prisma.organizationMember.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!member) return errorResponse("Member not found", 404);
    if (member.role === "OWNER")
      return errorResponse("Cannot remove owner", 400);

    await prisma.organizationMember.delete({ where: { id: params!.id } });
    return jsonResponse({ success: true });
  },
  { minRole: "ADMIN" },
);
