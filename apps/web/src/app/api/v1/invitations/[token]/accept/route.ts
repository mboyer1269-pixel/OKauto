import bcrypt from "bcryptjs";
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
} from "@/lib/auth";
import {
  ACCEPT_INVITE_MAX_FAILURES,
  INVITE_DUMMY_PASSWORD_HASH,
  MEMBER_INVITE_INVALID_MESSAGE,
  MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE,
  MEMBER_INVITE_SESSION_MISMATCH_MESSAGE,
  inviteLoginPath,
} from "@/lib/member-provisioning";
import {
  enforceAcceptInviteRateLimit,
  recordAcceptInviteFailure,
} from "@/lib/rate-limit";

export async function POST(
  request: Request,
  segmentData: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await segmentData.params;
    const tokenHash = hashToken(token);

    const limited = await enforceAcceptInviteRateLimit(request, tokenHash);
    if (limited) return limited;

    const invite = await prisma.organizationInvite.findUnique({
      where: { tokenHash },
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
    await bcrypt.compare("invite", INVITE_DUMMY_PASSWORD_HASH);

    const fail = async (status: 401 | 403, message: string) => {
      const failures = await recordAcceptInviteFailure(tokenHash);
      if (failures >= ACCEPT_INVITE_MAX_FAILURES) {
        await prisma.organizationInvite.updateMany({
          where: { id: invite.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
      }
      return errorResponse(message, status, {
        loginUrl: inviteLoginPath(token),
      });
    };

    if (existing) {
      if (
        !auth ||
        auth.email.toLocaleLowerCase("fr-CA") !==
          invite.email.toLocaleLowerCase("fr-CA")
      ) {
        if (auth) {
          return fail(403, MEMBER_INVITE_SESSION_MISMATCH_MESSAGE);
        }
        return fail(401, MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE);
      }

      const member = await prisma.$transaction(async (tx) => {
        const consumed = await tx.organizationInvite.updateMany({
          where: { id: invite.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consumed.count === 0) return null;

        await tx.user.update({
          where: { id: existing.id },
          data: { isActive: true },
        });

        const already = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: invite.organizationId,
              userId: existing.id,
            },
          },
        });
        if (already) return already;

        return tx.organizationMember.create({
          data: {
            organizationId: invite.organizationId,
            userId: existing.id,
            role: invite.role,
          },
        });
      });

      if (!member) {
        return errorResponse(MEMBER_INVITE_INVALID_MESSAGE, 404);
      }

      await createAuditLog({
        organizationId: invite.organizationId,
        userId: existing.id,
        action: "INVITE",
        entityType: "organization_invite",
        entityId: invite.id,
        metadata: { accepted: true, provisionedNewAccount: false },
        request: request as never,
      });

      return jsonResponse({
        memberId: member.id,
        attached: true,
      });
    }

    if (auth) {
      if (
        auth.email.toLocaleLowerCase("fr-CA") !==
        invite.email.toLocaleLowerCase("fr-CA")
      ) {
        return fail(403, MEMBER_INVITE_SESSION_MISMATCH_MESSAGE);
      }
      return fail(401, MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE);
    }

    if (!data.password) {
      return fail(401, MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE);
    }

    const passwordHash = await hashPassword(data.password);
    const created = await prisma.$transaction(async (tx) => {
      const consumed = await tx.organizationInvite.updateMany({
        where: { id: invite.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 0) return null;

      const user = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash,
          name: data.name?.trim() || invite.name,
          provisionedByOrganizationId: invite.organizationId,
        },
      });
      const member = await tx.organizationMember.create({
        data: {
          organizationId: invite.organizationId,
          userId: user.id,
          role: invite.role,
        },
      });
      return { user, member };
    });

    if (!created) {
      return errorResponse(MEMBER_INVITE_INVALID_MESSAGE, 404);
    }

    await createAuditLog({
      organizationId: invite.organizationId,
      userId: created.user.id,
      action: "INVITE",
      entityType: "organization_invite",
      entityId: invite.id,
      metadata: { accepted: true, provisionedNewAccount: true },
      request: request as never,
    });

    const accessToken = await signAccessToken({
      sub: created.user.id,
      email: created.user.email,
      orgId: invite.organizationId,
      role: created.member.role,
    });
    const refreshToken = await createRefreshToken(
      created.user.id,
      invite.organizationId,
    );

    const response = jsonResponse({
      memberId: created.member.id,
      user: {
        id: created.user.id,
        email: created.user.email,
        name: created.user.name,
      },
      organization: {
        id: invite.organization.id,
        name: invite.organization.name,
        slug: invite.organization.slug,
      },
      role: created.member.role,
      isPlatformAdmin: isPlatformAdminUserId(created.user.id),
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
