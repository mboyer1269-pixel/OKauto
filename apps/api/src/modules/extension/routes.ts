import type { FastifyInstance } from "fastify";
import { AppError, createExtensionTokenSchema, hasPermission } from "@okauto/shared";
import { generateExtensionToken } from "../../lib/tokens.js";
import { writeAudit } from "../../lib/audit.js";

export default async function extensionRoutes(app: FastifyInstance) {
  app.get("/extension/ping", { preHandler: [app.requireOrg("org:read")] }, async (request) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: request.auth!.userId },
      select: { id: true, email: true, name: true },
    });
    const org = await app.prisma.organization.findUniqueOrThrow({
      where: { id: request.org!.orgId },
      select: { id: true, name: true, slug: true },
    });
    return {
      ok: true,
      serverTime: new Date().toISOString(),
      user,
      org,
      role: request.org!.role,
      viaExtensionToken: request.auth!.actorType === "EXTENSION",
    };
  });

  app.post("/extension/tokens", { preHandler: [app.requireOrg("extension:token:manage-own")] }, async (request, reply) => {
    const input = createExtensionTokenSchema.parse(request.body);
    const orgId = request.org!.orgId;
    const parts = generateExtensionToken();
    const token = await app.prisma.extensionToken.create({
      data: {
        userId: request.auth!.userId,
        orgId,
        label: input.label,
        prefix: parts.prefix,
        tokenHash: parts.tokenHash,
      },
    });
    await writeAudit(app.prisma, {
      orgId,
      actorType: request.auth!.actorType,
      actorUserId: request.auth!.userId,
      action: "EXTENSION_TOKEN_CREATED",
      entityType: "ExtensionToken",
      entityId: token.id,
      meta: { label: input.label, prefix: parts.prefix },
      ip: request.ip,
    });
    return reply.status(201).send({
      token: {
        id: token.id,
        label: token.label,
        prefix: token.prefix,
        createdAt: token.createdAt,
      },
      // Returned exactly once — the API stores only a hash.
      plaintext: parts.plaintext,
    });
  });

  app.get("/extension/tokens", { preHandler: [app.requireOrg("extension:token:manage-own")] }, async (request) => {
    const canAll = hasPermission(request.org!.role, "extension:token:manage-all", request.auth!.isPlatformAdmin);
    const tokens = await app.prisma.extensionToken.findMany({
      where: {
        orgId: request.org!.orgId,
        ...(canAll ? {} : { userId: request.auth!.userId }),
      },
      select: {
        id: true,
        label: true,
        prefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return { tokens };
  });

  app.delete("/extension/tokens/:id", { preHandler: [app.requireOrg("extension:token:manage-own")] }, async (request) => {
    const { id } = request.params as { id: string };
    const token = await app.prisma.extensionToken.findFirst({
      where: { id, orgId: request.org!.orgId },
    });
    if (!token) throw AppError.notFound("Token not found");
    const canAll = hasPermission(request.org!.role, "extension:token:manage-all", request.auth!.isPlatformAdmin);
    if (!canAll && token.userId !== request.auth!.userId) {
      throw AppError.forbidden("You can only revoke your own tokens");
    }
    await app.prisma.extensionToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await writeAudit(app.prisma, {
      orgId: request.org!.orgId,
      actorType: request.auth!.actorType,
      actorUserId: request.auth!.userId,
      action: "EXTENSION_TOKEN_REVOKED",
      entityType: "ExtensionToken",
      entityId: id,
      ip: request.ip,
    });
    return { ok: true };
  });
}
