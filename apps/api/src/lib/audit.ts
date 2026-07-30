import { prisma } from '../db.js';
import type { Prisma } from '@prisma/client';

export async function writeAudit(input: {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId ?? undefined,
      actorId: input.actorId ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      meta: input.meta ?? {},
      ip: input.ip ?? undefined,
    },
  });
}
