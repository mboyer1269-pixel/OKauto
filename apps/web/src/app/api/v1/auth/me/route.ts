import { prisma } from "@okauto/database";
import { isPlatformAdminEmail } from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse } from "@/lib/api";

export const GET = withAuth(async (_request, { auth }) => {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: auth.orgId,
        userId: auth.sub,
      },
    },
    include: {
      user: { select: { id: true, email: true, name: true, isActive: true } },
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!membership?.user.isActive) {
    return errorResponse("Unauthorized", 401);
  }

  return jsonResponse({
    user: {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
    },
    organization: membership.organization,
    role: membership.role,
    isPlatformAdmin: isPlatformAdminEmail(membership.user.email),
  });
});
