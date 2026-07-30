import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@okauto/db";
import {
  createSession,
  hashPassword,
  hashToken,
  setSessionCookie,
} from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

const acceptSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(120),
  password: z.string().min(10).max(128),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const limited = rateLimit(`invite:${ip}`, 20, 60_000);
    if (!limited.ok) return jsonError("Too many attempts", 429);

    const body = acceptSchema.parse(await req.json());
    const invite = await db.invite.findUnique({
      where: { tokenHash: hashToken(body.token) },
      include: { org: true },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return jsonError("Invite is invalid or expired", 400);
    }

    let user = await db.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: invite.email,
          name: body.name,
          passwordHash: await hashPassword(body.password),
        },
      });
    }

    await db.membership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: invite.orgId } },
      create: {
        userId: user.id,
        orgId: invite.orgId,
        role: invite.role,
        status: "ACTIVE",
      },
      update: { role: invite.role, status: "ACTIVE" },
    });

    await db.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    await db.auditLog.create({
      data: {
        orgId: invite.orgId,
        actorId: user.id,
        action: "INVITE_ACCEPTED",
        entityType: "Invite",
        entityId: invite.id,
      },
    });

    const session = await createSession(user.id, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      ip,
    });
    await setSessionCookie(session.token, session.expiresAt);

    return jsonOk({
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: invite.org.id,
        name: invite.org.name,
        slug: invite.org.slug,
      },
      role: invite.role,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
