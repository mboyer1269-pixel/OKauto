import { NextRequest } from "next/server";
import { isPlatformAdminUserId, loginSchema } from "@okauto/shared";
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
import {
  clearAuthFailures,
  enforceAuthRateLimit,
  recordAuthFailure,
} from "@/lib/rate-limit";

// Dummy bcrypt hash used when no user exists so compare() still takes a similar time.
const DUMMY_PASSWORD_HASH =
  "$2a$12$GeR0Sdv/LqGKs/Sgw40sPe/EV66O3omHonLcXOwfQ1/W3fVIUDRpu";

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<unknown>(request);
    const data = loginSchema.parse(body);

    const limited = await enforceAuthRateLimit(request, "login", data.email);
    if (limited) return limited;

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        memberships: {
          where: { organization: { isActive: true } },
          include: { organization: true },
          orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });

    const passwordOk = await verifyPassword(
      data.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !user.isActive || !passwordOk) {
      await recordAuthFailure(request, "login", data.email);
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
    await clearAuthFailures("login", data.email);

    const response = jsonResponse({
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
      role: membership.role,
      isPlatformAdmin: isPlatformAdminUserId(user.id),
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
