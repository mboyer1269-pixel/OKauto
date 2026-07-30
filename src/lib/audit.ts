import { createHmac } from "node:crypto";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { env } from "@/lib/env";

export async function audit(
  context: AuthContext,
  request: Request,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipHash = forwarded ? createHmac("sha256", env().IP_HASH_KEY).update(forwarded).digest("hex") : null;
  await db().insert(auditLogs).values({
    organizationId: context.organization.id,
    actorId: context.user.id,
    action,
    entityType,
    entityId,
    requestId: request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID(),
    ipHash,
    metadata,
  });
}
