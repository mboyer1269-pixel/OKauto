import type { FastifyInstance } from "fastify";
import { updateOrgSchema } from "@okauto/shared";
import { writeAudit } from "../../lib/audit.js";

export default async function orgRoutes(app: FastifyInstance) {
  app.get("/orgs/current", { preHandler: [app.requireOrg("org:read")] }, async (request) => {
    const org = await app.prisma.organization.findUniqueOrThrow({
      where: { id: request.org!.orgId },
      include: {
        _count: { select: { memberships: true, vehicles: true, listings: true } },
      },
    });
    return { org, role: request.org!.role };
  });

  app.patch("/orgs/current", { preHandler: [app.requireOrg("org:update")] }, async (request) => {
    const input = updateOrgSchema.parse(request.body);
    const orgId = request.org!.orgId;
    const existing = await app.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const mergedSettings = {
      ...(typeof existing.settings === "object" && existing.settings !== null ? (existing.settings as object) : {}),
      ...(input.settings ?? {}),
    };
    const org = await app.prisma.organization.update({
      where: { id: orgId },
      data: {
        name: input.name,
        timezone: input.timezone,
        vertical: input.vertical,
        settings: mergedSettings,
      },
    });
    await writeAudit(app.prisma, {
      orgId,
      actorType: request.auth!.actorType,
      actorUserId: request.auth!.userId,
      action: "ORG_UPDATED",
      entityType: "Organization",
      entityId: orgId,
      meta: { changedKeys: Object.keys(input) },
      ip: request.ip,
    });
    return { org };
  });

  app.patch("/orgs/current/onboarding", { preHandler: [app.requireOrg("org:read")] }, async (request) => {
    const orgId = request.org!.orgId;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const existing = await app.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const current =
      typeof existing.onboarding === "object" && existing.onboarding !== null
        ? (existing.onboarding as Record<string, unknown>)
        : {};
    const allowed = ["inventoryAdded", "descriptionGenerated", "extensionInstalled", "teamInvited", "dismissed"];
    for (const key of allowed) {
      if (typeof body[key] === "boolean") current[key] = body[key];
    }
    const org = await app.prisma.organization.update({
      where: { id: orgId },
      data: { onboarding: current as import("@okauto/db").Prisma.InputJsonValue },
    });
    return { onboarding: org.onboarding };
  });
}
