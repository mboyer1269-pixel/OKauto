import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { loginSchema } from "@okauto/shared";
import {
  createSession,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const limited = rateLimit(`login:${ip}`, 30, 60_000);
    if (!limited.ok) {
      return jsonError("Too many login attempts. Try again shortly.", 429);
    }

    const body = loginSchema.parse(await req.json());
    const user = await db.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { org: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      return jsonError("Invalid email or password", 401);
    }
    if (!user.memberships.length) {
      return jsonError("No active organization membership", 403);
    }

    const session = await createSession(user.id, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    await setSessionCookie(session.token, session.expiresAt);

    const membership = user.memberships[0]!;
    return jsonOk({
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.org.id,
        name: membership.org.name,
        slug: membership.org.slug,
      },
      role: membership.role,
      memberships: user.memberships.map((m) => ({
        orgId: m.orgId,
        role: m.role,
        orgName: m.org.name,
        slug: m.org.slug,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
