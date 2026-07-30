import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { registerSchema } from "@okauto/shared";
import {
  createSession,
  hashPassword,
  setSessionCookie,
  slugify,
} from "@/lib/auth";
import { handleRouteError, jsonCreated, jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const limited = rateLimit(`register:${ip}`, 10, 60_000);
    if (!limited.ok) {
      return jsonError("Too many registration attempts. Try again shortly.", 429);
    }

    const body = registerSchema.parse(await req.json());
    const existing = await db.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) return jsonError("Email already registered", 409);

    const baseSlug = slugify(body.organizationName) || "dealership";
    let slug = baseSlug;
    let n = 1;
    while (await db.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${n++}`;
    }

    const passwordHash = await hashPassword(body.password);
    const user = await db.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        memberships: {
          create: {
            role: "OWNER",
            status: "ACTIVE",
            org: {
              create: {
                name: body.organizationName,
                slug,
              },
            },
          },
        },
      },
      include: {
        memberships: { include: { org: true } },
      },
    });

    const membership = user.memberships[0]!;
    await db.inventorySource.create({
      data: {
        orgId: membership.orgId,
        name: "Manual entry",
        type: "MANUAL",
        health: "HEALTHY",
      },
    });

    await db.auditLog.create({
      data: {
        orgId: membership.orgId,
        actorId: user.id,
        action: "ORG_CREATED",
        entityType: "Organization",
        entityId: membership.orgId,
      },
    });

    const session = await createSession(user.id, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    await setSessionCookie(session.token, session.expiresAt);

    return jsonCreated({
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.org.id,
        name: membership.org.name,
        slug: membership.org.slug,
      },
      role: membership.role,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
