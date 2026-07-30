import type { Db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";

export interface AuditEntry {
  orgId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

/** Fire-and-forget audit writer; audit failures must never break requests. */
export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      orgId: entry.orgId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      meta: entry.meta ?? {},
      ip: entry.ip ?? null,
    });
  } catch (err) {
    console.error("audit write failed", err);
  }
}
