import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AppError,
  MAX_CSV_ROWS,
  createImportSourceSchema,
  jsonFeedItemSchema,
  updateImportSourceSchema,
} from "@okauto/shared";
import { csvToFeedItems } from "./csv.js";
import { applyImportItems } from "../../services/sync.js";
import { notificationHub } from "../notifications/hub.js";
import { writeAudit } from "../../lib/audit.js";
import { runImportForSource } from "../../jobs/handlers/import-run.js";

async function csvSourceId(app: FastifyInstance, orgId: string): Promise<string> {
  const existing = await app.prisma.importSource.findFirst({ where: { orgId, type: "CSV" } });
  if (existing) return existing.id;
  const created = await app.prisma.importSource.create({
    data: { orgId, type: "CSV", name: "CSV uploads" },
  });
  return created.id;
}

export default async function importRoutes(app: FastifyInstance) {
  app.get("/imports/sources", { preHandler: [app.requireOrg("import:read")] }, async (request) => {
    const sources = await app.prisma.importSource.findMany({
      where: { orgId: request.org!.orgId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { vehicles: true, runs: true } } },
    });
    return { sources };
  });

  app.post("/imports/sources", { preHandler: [app.requireOrg("import:manage")] }, async (request, reply) => {
    const input = createImportSourceSchema.parse(request.body);
    if (input.type === "JSON_FEED" && !input.config.feedUrl) {
      throw AppError.validation("config.feedUrl is required for JSON_FEED sources");
    }
    if (input.type === "WEBHOOK" && !input.config.webhookSecret) {
      input.config.webhookSecret = createHmac("sha256", "okauto").update(String(Date.now())).digest("hex").slice(0, 32);
    }
    const source = await app.prisma.importSource.create({
      data: {
        orgId: request.org!.orgId,
        type: input.type,
        name: input.name,
        scheduleMinutes: input.scheduleMinutes,
        config: input.config,
      },
    });
    await writeAudit(app.prisma, {
      orgId: request.org!.orgId,
      actorType: request.auth!.actorType,
      actorUserId: request.auth!.userId,
      action: "IMPORT_SOURCE_CREATED",
      entityType: "ImportSource",
      entityId: source.id,
      meta: { type: input.type },
      ip: request.ip,
    });
    return reply.status(201).send({ source });
  });

  app.patch("/imports/sources/:id", { preHandler: [app.requireOrg("import:manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = updateImportSourceSchema.parse(request.body);
    const existing = await app.prisma.importSource.findFirst({ where: { id, orgId: request.org!.orgId } });
    if (!existing) throw AppError.notFound("Import source not found");
    const body = (request.body ?? {}) as { status?: string };
    const source = await app.prisma.importSource.update({
      where: { id },
      data: {
        name: input.name,
        scheduleMinutes: input.scheduleMinutes,
        config: input.config ? { ...(existing.config as object), ...input.config } : undefined,
        status: body.status === "PAUSED" ? "PAUSED" : body.status === "ACTIVE" ? "ACTIVE" : undefined,
      },
    });
    return { source };
  });

  app.delete("/imports/sources/:id", { preHandler: [app.requireOrg("import:manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.importSource.findFirst({ where: { id, orgId: request.org!.orgId } });
    if (!existing) throw AppError.notFound("Import source not found");
    await app.prisma.importSource.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/imports/runs", { preHandler: [app.requireOrg("import:read")] }, async (request) => {
    const { sourceId } = request.query as { sourceId?: string };
    const runs = await app.prisma.importRun.findMany({
      where: { source: { orgId: request.org!.orgId }, ...(sourceId ? { sourceId } : {}) },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { source: { select: { id: true, name: true, type: true } } },
    });
    return { runs };
  });

  app.post("/imports/sources/:id/run", { preHandler: [app.requireOrg("import:run")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const source = await app.prisma.importSource.findFirst({ where: { id, orgId: request.org!.orgId } });
    if (!source) throw AppError.notFound("Import source not found");
    if (source.type !== "JSON_FEED") throw AppError.validation("Only JSON_FEED sources can be run on demand");
    const job = await app.jobQueue.enqueue(
      "IMPORT_RUN",
      { sourceId: source.id, orgId: source.orgId, triggeredById: request.auth!.userId },
      { dedupeKey: `import:${source.id}:${Date.now()}` },
    );
    return reply.status(202).send({ jobId: job.id, status: "queued" });
  });

  app.post(
    "/imports/csv",
    { preHandler: [app.requireOrg("import:manage")], config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const orgId = request.org!.orgId;
      let text: string;
      if (request.isMultipart()) {
        const file = await request.file();
        if (!file) throw AppError.validation("CSV file is required (field 'file')");
        text = (await file.toBuffer()).toString("utf8");
      } else {
        text = String((request.body as { csv?: string })?.csv ?? "");
      }
      if (!text.trim()) throw AppError.validation("CSV content is empty");

      const { items, headerErrors } = csvToFeedItems(text);
      if (headerErrors.length > 0) throw AppError.validation("Invalid CSV", { headerErrors });
      if (items.length === 0) throw AppError.validation("CSV contains no data rows");
      if (items.length > MAX_CSV_ROWS) throw AppError.validation(`CSV exceeds ${MAX_CSV_ROWS} rows`);

      const validated: ReturnType<typeof jsonFeedItemSchema.parse>[] = [];
      const preErrors: { index: number; message: string }[] = [];
      items.forEach((raw, index) => {
        const parsed = jsonFeedItemSchema.safeParse(raw);
        if (parsed.success) validated.push(parsed.data);
        else preErrors.push({ index, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      });
      const sourceId = await csvSourceId(app, orgId);

      const run = await app.prisma.importRun.create({
        data: { sourceId, status: "RUNNING" },
      });
      const startedAt = run.startedAt;
      const stats = await applyImportItems(app.prisma, validated, {
        orgId,
        sourceId,
        actor: { type: "USER", userId: request.auth!.userId },
        maxPhotos: app.config.IMPORT_MAX_PHOTOS,
        hub: notificationHub,
      });
      stats.failed += preErrors.length;
      stats.errors = [...preErrors, ...stats.errors];
      const status = stats.failed === 0 ? "SUCCEEDED" : stats.created + stats.updated + stats.unchanged > 0 ? "PARTIAL" : "FAILED";
      const finished = await app.prisma.importRun.update({
        where: { id: run.id },
        data: { status, stats: stats as object, finishedAt: new Date() },
      });
      await app.prisma.importSource.update({
        where: { id: sourceId },
        data: {
          lastRunAt: startedAt,
          lastStatus: status,
          lastError: stats.errors.length > 0 ? `${stats.failed} row(s) failed` : null,
        },
      });
      await writeAudit(app.prisma, {
        orgId,
        actorType: request.auth!.actorType,
        actorUserId: request.auth!.userId,
        action: "CSV_IMPORT",
        entityType: "ImportRun",
        entityId: run.id,
        meta: { rows: items.length, status },
        ip: request.ip,
      });
      return { run: finished, stats };
    },
  );

  // HMAC-signed push endpoint for full-feed vendors (no session auth by design).
  app.post("/imports/webhook/:sourceId", async (request) => {
    const { sourceId } = request.params as { sourceId: string };
    const source = await app.prisma.importSource.findUnique({ where: { id: sourceId } });
    if (!source || source.type !== "WEBHOOK" || source.status !== "ACTIVE") {
      throw AppError.notFound("Webhook source not found");
    }
    const secret = (source.config as { webhookSecret?: string }).webhookSecret;
    if (!secret) throw AppError.validation("Webhook source is missing a secret");

    const signature = request.headers["x-okauto-signature"];
    const rawBody = JSON.stringify(request.body ?? {});
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const provided = typeof signature === "string" ? signature : "";
    const valid =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
    if (!valid) throw AppError.unauthorized("Invalid webhook signature");

    const payload = request.body as { items?: unknown[] };
    if (!Array.isArray(payload.items)) throw AppError.validation("Body must be { items: [...] }");
    if (payload.items.length > MAX_CSV_ROWS) throw AppError.validation(`Payload exceeds ${MAX_CSV_ROWS} items`);
    const items: ReturnType<typeof jsonFeedItemSchema.parse>[] = [];
    const preErrors: { index: number; message: string }[] = [];
    payload.items.forEach((raw, index) => {
      const parsed = jsonFeedItemSchema.safeParse(raw);
      if (parsed.success) items.push(parsed.data);
      else preErrors.push({ index, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    });

    const run = await app.prisma.importRun.create({ data: { sourceId, status: "RUNNING" } });
    const stats = await applyImportItems(app.prisma, items, {
      orgId: source.orgId,
      sourceId,
      actor: { type: "WEBHOOK" },
      maxPhotos: app.config.IMPORT_MAX_PHOTOS,
      hub: notificationHub,
    });
    stats.failed += preErrors.length;
    stats.errors = [...preErrors, ...stats.errors];
    const status = stats.failed === 0 ? "SUCCEEDED" : stats.created + stats.updated + stats.unchanged > 0 ? "PARTIAL" : "FAILED";
    await app.prisma.importRun.update({
      where: { id: run.id },
      data: { status, stats: stats as object, finishedAt: new Date() },
    });
    await app.prisma.importSource.update({
      where: { id: sourceId },
      data: { lastRunAt: run.startedAt, lastStatus: status, lastError: stats.failed > 0 ? `${stats.failed} item(s) failed` : null },
    });
    return { stats };
  });

  // Manual run (development convenience + tests): executes synchronously.
  app.post("/imports/sources/:id/run-sync", { preHandler: [app.requireOrg("import:run")] }, async (request) => {
    const { id } = request.params as { id: string };
    const source = await app.prisma.importSource.findFirst({ where: { id, orgId: request.org!.orgId } });
    if (!source) throw AppError.notFound("Import source not found");
    const result = await runImportForSource(app.prisma, notificationHub, app.config, {
      sourceId: source.id,
      triggeredById: request.auth!.userId,
    });
    return result;
  });
}
