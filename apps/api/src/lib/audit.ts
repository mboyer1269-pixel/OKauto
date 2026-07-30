import type { ActorType, Prisma, PrismaClient } from "@okauto/db";

export interface AuditEntry {
  orgId?: string | null;
  actorType: ActorType;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}

type Tx = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(db: Tx, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      orgId: entry.orgId ?? null,
      actorType: entry.actorType,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      meta: entry.meta ?? undefined,
      ip: entry.ip ?? null,
    },
  });
}
