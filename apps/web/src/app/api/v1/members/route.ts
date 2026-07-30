import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { inviteSchema } from "@okauto/shared";
import { authenticateRequest, generateToken, hashToken } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { handleRouteError, jsonCreated, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, "MANAGER");
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const members = await db.membership.findMany({
      where: { orgId: auth.org.id },
      include: {
        user: { select: { id: true, email: true, name: true, createdAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const invites = await db.invite.findMany({
      where: { orgId: auth.org.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ members, invites });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, "ADMIN");
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const body = inviteSchema.parse(await req.json());
    if (body.role === "OWNER") {
      return jsonError("Cannot invite another OWNER via this endpoint", 400);
    }

    const token = generateToken();
    const invite = await db.invite.create({
      data: {
        orgId: auth.org.id,
        email: body.email.toLowerCase(),
        role: body.role,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await writeAudit(auth, "MEMBER_INVITED", "Invite", invite.id, {
      email: body.email,
      role: body.role,
    });

    // Email delivery optional — return invite link for demo
    const inviteUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`;
    return jsonCreated({
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
      inviteUrl,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
