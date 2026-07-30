import { prisma, type Prisma } from "@okauto/db";

export async function writeAudit(input: {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}) {
  return prisma.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: (input.meta ?? {}) as Prisma.InputJsonValue,
      ip: input.ip ?? null,
    },
  });
}

export async function notifyUsers(input: {
  organizationId: string;
  userIds: string[];
  type: string;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
}) {
  if (input.userIds.length === 0) return [];
  return prisma.$transaction(
    input.userIds.map((userId) =>
      prisma.notification.create({
        data: {
          organizationId: input.organizationId,
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          meta: (input.meta ?? {}) as Prisma.InputJsonValue,
        },
      }),
    ),
  );
}
