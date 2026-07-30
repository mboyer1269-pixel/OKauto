import type { FastifyInstance } from "fastify";
import { AppError, descriptionTemplateSchema, generateDescriptionSchema } from "@okauto/shared";
import { createDescriptionProvider } from "../../services/descriptions.js";
import { writeAudit } from "../../lib/audit.js";

export default async function descriptionRoutes(app: FastifyInstance) {
  app.post(
    "/vehicles/:id/description:generate",
    { preHandler: [app.requireOrg("description:generate")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = generateDescriptionSchema.parse(request.body ?? {});
      const orgId = request.org!.orgId;

      const vehicle = await app.prisma.vehicle.findFirst({ where: { id, orgId } });
      if (!vehicle) throw AppError.notFound("Vehicle not found");
      const org = await app.prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        include: { templates: true },
      });
      const settings = (org.settings ?? {}) as {
        dealerContact?: string;
        descriptionFooter?: string;
        defaultTemplateId?: string | null;
      };
      const template =
        org.templates.find((t) => t.id === input.templateId) ??
        org.templates.find((t) => t.id === settings.defaultTemplateId) ??
        org.templates.find((t) => t.isDefault) ??
        null;

      const provider = createDescriptionProvider(app.config);
      const result = await provider.generate({
        vehicle,
        template: template?.body ?? null,
        dealerName: org.name,
        dealerContact: settings.dealerContact ?? null,
        footer: settings.descriptionFooter ?? null,
        tone: input.tone,
        highlights: input.highlights ?? [],
      });

      if (input.persist) {
        await app.prisma.vehicle.update({ where: { id: vehicle.id }, data: { description: result.text } });
        // Keep non-terminal listings in sync when they still carry the old generated copy.
        await app.prisma.listing.updateMany({
          where: {
            vehicleId: vehicle.id,
            status: { in: ["DRAFT", "READY", "QUEUED", "ASSIGNED"] },
            OR: [{ description: vehicle.description }, { description: null }],
          },
          data: { description: result.text },
        });
      }
      await writeAudit(app.prisma, {
        orgId,
        actorType: request.auth!.actorType,
        actorUserId: request.auth!.userId,
        action: "DESCRIPTION_GENERATED",
        entityType: "Vehicle",
        entityId: vehicle.id,
        meta: { provider: result.provider, tone: input.tone, persisted: input.persist },
        ip: request.ip,
      });
      return result;
    },
  );

  app.get("/description-templates", { preHandler: [app.requireOrg("org:read")] }, async (request) => {
    const templates = await app.prisma.descriptionTemplate.findMany({
      where: { orgId: request.org!.orgId },
      orderBy: { createdAt: "asc" },
    });
    return { templates };
  });

  app.post("/description-templates", { preHandler: [app.requireOrg("template:manage")] }, async (request, reply) => {
    const input = descriptionTemplateSchema.parse(request.body);
    const orgId = request.org!.orgId;
    const template = await app.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.descriptionTemplate.updateMany({ where: { orgId }, data: { isDefault: false } });
      }
      return tx.descriptionTemplate.create({
        data: { orgId, name: input.name, body: input.body, isDefault: input.isDefault },
      });
    });
    return reply.status(201).send({ template });
  });

  app.patch("/description-templates/:id", { preHandler: [app.requireOrg("template:manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = descriptionTemplateSchema.partial().parse(request.body);
    const orgId = request.org!.orgId;
    const existing = await app.prisma.descriptionTemplate.findFirst({ where: { id, orgId } });
    if (!existing) throw AppError.notFound("Template not found");
    const template = await app.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.descriptionTemplate.updateMany({ where: { orgId, id: { not: id } }, data: { isDefault: false } });
      }
      return tx.descriptionTemplate.update({
        where: { id },
        data: { name: input.name, body: input.body, isDefault: input.isDefault },
      });
    });
    return { template };
  });

  app.delete("/description-templates/:id", { preHandler: [app.requireOrg("template:manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.descriptionTemplate.findFirst({
      where: { id, orgId: request.org!.orgId },
    });
    if (!existing) throw AppError.notFound("Template not found");
    await app.prisma.descriptionTemplate.delete({ where: { id } });
    return { ok: true };
  });
}
