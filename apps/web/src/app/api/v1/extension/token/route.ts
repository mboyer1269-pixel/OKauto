import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { authenticateRequest, generateToken, hashToken } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { handleRouteError, jsonCreated, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const tokens = await db.extensionToken.findMany({
      where: {
        userId: auth.user.id,
        orgId: auth.org.id,
        revokedAt: null,
      },
      select: {
        id: true,
        label: true,
        tokenPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ tokens });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const body = (await req.json().catch(() => ({}))) as { label?: string; days?: number };
    const raw = `oka_${generateToken(24)}`;
    const days = Math.min(Math.max(body.days ?? 90, 1), 365);

    const token = await db.extensionToken.create({
      data: {
        userId: auth.user.id,
        orgId: auth.org.id,
        label: body.label?.trim() || "Chrome extension",
        tokenHash: hashToken(raw),
        tokenPrefix: raw.slice(0, 10),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });

    await writeAudit(auth, "EXTENSION_TOKEN_CREATED", "ExtensionToken", token.id);

    return jsonCreated({
      token: raw,
      id: token.id,
      prefix: token.tokenPrefix,
      expiresAt: token.expiresAt,
      warning: "Store this token securely. It will not be shown again.",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
