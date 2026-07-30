/** Audit log helper. Records mutating actions for compliance and debugging. */
import { prisma } from '@okauto/db';
import { logger } from './logger';

export interface AuditInput {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata as object | undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    // Never let audit failures break the request.
    logger.error('Failed to write audit log', { action: input.action, error: String(error) });
  }
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip');
}
