import { db, type Prisma } from "@okauto/db";
import type { AuthContext } from "./auth";

export async function writeAudit(
  ctx: AuthContext,
  action: string,
  entityType: string,
  entityId?: string,
  meta?: Record<string, unknown>,
) {
  await db.auditLog.create({
    data: {
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      action,
      entityType,
      entityId,
      meta: (meta ?? {}) as Prisma.InputJsonValue,
    },
  });
}
