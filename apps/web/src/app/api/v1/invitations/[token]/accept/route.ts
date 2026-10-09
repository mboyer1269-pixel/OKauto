import { prisma } from "@okauto/database";
import { acceptInviteSchema, isPlatformAdminUserId } from "@okauto/shared";
import {
  jsonResponse,
  errorResponse,
  handleApiError,
  parseBody,
} from "@/lib/api";
import {
  createAuditLog,
  createRefreshToken,
  getAuthFromRequest,
  hashPassword,
  hashToken,
  isAccessTokenRevoked,
  signAccessToken,
  verifyPassword,
} from "@/lib/auth";
import { MEMBER_INVITE_INVALID_MESSAGE } from "@/lib/member-provisioning";

const GENERIC_CREDENTIALS_ERROR = "Courriel ou mot de passe invalide";

export async function POST(
  request: Request,
  segmentData: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await segmentData.params;
    const invite = await prisma.organizationInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: true },
    });
    if (
      !invite ||
      invite.consumedAt ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      return errorResponse(MEMBER_INVITE_INVALID_MESSAGE, 404);
    }

    const auth = await getAuthFromRequest(request as never);
    if (auth && (await isAccessTokenRevoked(auth))) {
      return errorResponse("Authentification requise", 401);
    }

    const body = await parseBody<unknown>(request).catch(() => ({}));
    const data = acceptInviteSchema.parse(body ?? {});

    const existing = await prisma.user.findUnique({
      where: { email: invite.email },
    });

    let userId: string;
    let userEmail = invite.email;
    let userName = invite.name;
    let provisionedNewAccount = false;

    if (auth) {
      if (auth.email.toLocaleLowerCase("fr-CA") !== invite.email) {
        return errorResponse(
          "Connectez-vous avec le courriel de cette invitation.",
          403,
        );
      }
      userId = auth.sub;
      userEmail = auth.email;
    } else if (existing) {
      if (!data.password) {
        return errorResponse(
          "Connectez-vous avec le courriel de cette invitation.",
          401,
        );
      }
      const passwordOk = await verifyPassword(
        data.password,
        existing.passwordHash,
      );
      if (!existing.isActive || !passwordOk) {
        return errorResponse(GENERIC_CREDENTIALS_ERROR, 401);
      }
      userId = existing.id;
      userEmail = existing.email;
      userName = existing.name;
    } else {
      if (!data.password) {
        return errorResponse("Un mot de passe est requis.", 400);
      }
      const passwordHash = await hashPassword(data.password);
      const created = await prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          name: data.name?.trim() || invite.name,
          provisionedByOrganizationId: invite.organizationId,
        },
      });
      userId = created.id;
      userName = created.name;
      provisionedNewAccount = true;
    }

    const member = await prisma.$transaction(async (tx) => {
      const consumed = await tx.organizationInvite.updateMany({
        where: { id: invite.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 0) {
        return null;
      }

      const already = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId,
          },
        },
      });
      if (already) return already;

      return tx.organizationMember.create({
        data: {
          organizationId: invite.organizationId,
          userId,
          role: invite.role,
        },
      });
    });

    if (!member) {
      return errorResponse(MEMBER_INVITE_INVALID_MESSAGE, 404);
    }

    await createAuditLog({
      organizationId: invite.organizationId,
      userId,
      action: "INVITE",
      entityType: "organization_invite",
      entityId: invite.id,
      metadata: { accepted: true, provisionedNewAccount },
      request: request as never,
    });

    const accessToken = await signAccessToken({
      sub: userId,
      email: userEmail,
      orgId: invite.organizationId,
      role: member.role,
    });
    const refreshToken = await createRefreshToken(
      userId,
      invite.organizationId,
    );

    const response = jsonResponse({
      memberId: member.id,
      user: { id: userId, email: userEmail, name: userName },
      organization: {
        id: invite.organization.id,
        name: invite.organization.name,
        slug: invite.organization.slug,
      },
      role: member.role,
      isPlatformAdmin: isPlatformAdminUserId(userId),
      accessToken,
      refreshToken,
    });
    response.cookies.set("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60,
      path: "/",
    });
    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
