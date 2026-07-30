import type { Job, PrismaClient } from "@okauto/db";
import type { JobKind } from "@okauto/shared";
import { z } from "zod";
import type { JobHandler } from "../worker.js";
import type { PgJobQueue } from "../queue.js";
import type { AppConfig } from "../../config.js";
import type { NotificationHub } from "../../modules/notifications/hub.js";
import type { EmailTransport } from "../../services/email.js";
import { runImportForSource } from "./import-run.js";
import { runSoldDetection } from "../../services/sold-detection.js";
import { createDescriptionProvider } from "../../services/descriptions.js";
import { writeAudit } from "../../lib/audit.js";

const importRunPayload = z.object({ sourceId: z.string(), orgId: z.string().optional(), triggeredById: z.string().nullish() });
const generateDescriptionPayload = z.object({
  orgId: z.string(),
  vehicleId: z.string(),
  userId: z.string().nullish(),
  templateId: z.string().nullish(),
  tone: z.enum(["professional", "friendly", "concise"]).default("professional"),
});
const sweepPayload = z.object({ orgId: z.string().nullish() }).passthrough();

export function buildJobHandlers(deps: {
  db: PrismaClient;
  queue: PgJobQueue;
  config: AppConfig;
  hub: NotificationHub;
  email: EmailTransport;
}): Map<JobKind, JobHandler> {
  const { db, queue, config, hub, email } = deps;
  const handlers = new Map<JobKind, JobHandler>();

  handlers.set("IMPORT_RUN", async (job: Job) => {
    const payload = importRunPayload.parse(job.payload);
    await runImportForSource(db, hub, config, {
      sourceId: payload.sourceId,
      triggeredById: payload.triggeredById ?? null,
    });
  });

  handlers.set("SYNC_SWEEP", async (job: Job) => {
    const payload = sweepPayload.parse(job.payload ?? {});
    // 1) Enqueue due scheduled feed sources.
    const now = Date.now();
    const dueSources = await db.importSource.findMany({
      where: {
        status: "ACTIVE",
        type: "JSON_FEED",
        scheduleMinutes: { gt: 0 },
        ...(payload.orgId ? { orgId: payload.orgId } : {}),
      },
    });
    for (const source of dueSources) {
      const dueAt = (source.lastRunAt?.getTime() ?? 0) + source.scheduleMinutes * 60_000;
      if (dueAt <= now) {
        await queue.enqueue(
          "IMPORT_RUN",
          { sourceId: source.id, orgId: source.orgId },
          { dedupeKey: `import:${source.id}:${Math.floor(now / (source.scheduleMinutes * 60_000))}` },
        );
      }
    }
    // 2) Sold detection across full-snapshot sources.
    await runSoldDetection(db, hub, payload.orgId ?? undefined);
  });

  handlers.set("GENERATE_DESCRIPTION", async (job: Job) => {
    const payload = generateDescriptionPayload.parse(job.payload);
    const vehicle = await db.vehicle.findFirst({ where: { id: payload.vehicleId, orgId: payload.orgId } });
    if (!vehicle) throw new Error(`Vehicle ${payload.vehicleId} not found`);
    const org = await db.organization.findUniqueOrThrow({
      where: { id: payload.orgId },
      include: { templates: true },
    });
    const settings = (org.settings ?? {}) as {
      dealerContact?: string;
      descriptionFooter?: string;
      defaultTemplateId?: string | null;
    };
    const template =
      org.templates.find((t) => t.id === payload.templateId) ??
      org.templates.find((t) => t.id === settings.defaultTemplateId) ??
      org.templates.find((t) => t.isDefault) ??
      null;
    const provider = createDescriptionProvider(config);
    const result = await provider.generate({
      vehicle,
      template: template?.body ?? null,
      dealerName: org.name,
      dealerContact: settings.dealerContact ?? null,
      footer: settings.descriptionFooter ?? null,
      tone: payload.tone,
      highlights: [],
    });
    await db.vehicle.update({ where: { id: vehicle.id }, data: { description: result.text } });
    await writeAudit(db, {
      orgId: payload.orgId,
      actorType: payload.userId ? "USER" : "SYSTEM",
      actorUserId: payload.userId ?? null,
      action: "DESCRIPTION_GENERATED",
      entityType: "Vehicle",
      entityId: vehicle.id,
      meta: { provider: result.provider, removedPhrases: result.removedPhrases, jobId: job.id },
    });
  });

  handlers.set("NOTIFICATION_DIGEST", async () => {
    // Daily-ish digest: per-user unread counts, delivered through the email transport.
    const unread = await db.notification.groupBy({
      by: ["userId", "orgId"],
      where: { readAt: null, userId: { not: null } },
      _count: { id: true },
    });
    for (const row of unread) {
      const user = await db.user.findUnique({ where: { id: row.userId! } });
      const org = await db.organization.findUnique({ where: { id: row.orgId } });
      if (!user || !org) continue;
      await email.send({
        to: user.email,
        subject: `OKauto: ${row._count.id} unread notification(s) at ${org.name}`,
        text: `You have ${row._count.id} unread notification(s) in your OKauto dashboard for ${org.name}.`,
      });
    }
  });

  return handlers;
}
