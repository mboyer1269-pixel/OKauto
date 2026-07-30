import { prisma } from "@lotpilot/db";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit, handler, hashToken, json, parseBody, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user, membership } = await requireOrgRole(req, orgId);
  // Salespeople see only their own tokens; managers/owners see all org tokens.
  const where =
    membership.role === "SALESPERSON"
      ? { organizationId: orgId, userId: user.id, revokedAt: null }
      : { organizationId: orgId, revokedAt: null };
  const tokens = await prisma.apiToken.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return json({ tokens });
});

const createSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId);
  const body = await parseBody(req, createSchema);

  const token = `lp_${randomBytes(30).toString("base64url")}`;
  const record = await prisma.apiToken.create({
    data: {
      organizationId: orgId,
      userId: user.id,
      name: body.name,
      tokenHash: hashToken(token),
    },
  });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "token.create",
    entityType: "api_token",
    entityId: record.id,
    data: { name: body.name },
  });
  // The raw token is returned exactly once and never stored in plaintext.
  return json({ token: { id: record.id, name: record.name, value: token } }, { status: 201 });
});
