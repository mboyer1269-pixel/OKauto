import { NextRequest } from "next/server";
import { loginSchema } from "@okauto/shared";
import { prisma } from "@okauto/database";
import {
  verifyPassword,
  signAccessToken,
  createRefreshToken,
  createAuditLog,
} from "@/lib/auth";
import {
  jsonResponse,
  errorResponse,
  handleApiError,
  parseBody,
} from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<unknown>(request);
    const data = loginSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        memberships: {
          include: { organization: true },
          take: 1,
        },
      },
    });

    if (!user || !user.isActive) {
      return errorResponse("Courriel ou mot de passe invalide", 401);
    }

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) {
      return errorResponse("Courriel ou mot de passe invalide", 401);
    }

    const membership = user.memberships[0];
    if (!membership) {
      return errorResponse("Aucune organisation associée à ce compte", 403);
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      orgId: membership.organizationId,
      role: membership.role,
    });
    const refreshToken = await createRefreshToken(
      user.id,
      membership.organizationId,
    );

    await createAuditLog({
      organizationId: membership.organizationId,
      userId: user.id,
      action: "LOGIN",
      request,
    });

    const response = jsonResponse({
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
      role: membership.role,
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
