import type { PrismaClient } from "@okauto/db";
import { jsonFeedItemSchema } from "@okauto/shared";
import { applyImportItems, type ImportStats } from "../../services/sync.js";
import { notifyUserOrLeaders } from "../../modules/notifications/service.js";
import type { NotificationHub } from "../../modules/notifications/hub.js";
import type { AppConfig } from "../../config.js";
import { incrementCounter } from "../../lib/metrics.js";

export interface RunImportResult {
  runId: string;
  status: "SUCCEEDED" | "FAILED" | "PARTIAL";
  stats: ImportStats;
}

/**
 * Executes one import run for a JSON_FEED source: fetch, validate, apply, and
 * record run/source health + notifications. Throws only on total fetch/parse
 * failure (run is still recorded as FAILED first).
 */
export async function runImportForSource(
  db: PrismaClient,
  hub: NotificationHub | null,
  config: AppConfig,
  params: { sourceId: string; triggeredById?: string | null },
): Promise<RunImportResult> {
  const source = await db.importSource.findUniqueOrThrow({ where: { id: params.sourceId } });
  const run = await db.importRun.create({ data: { sourceId: source.id, status: "RUNNING" } });

  const failRun = async (message: string): Promise<never> => {
    await db.importRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });
    await db.importSource.update({
      where: { id: source.id },
      data: { lastStatus: "FAILED", lastError: message },
    });
    await notifyUserOrLeaders(db, hub, {
      orgId: source.orgId,
      type: "IMPORT_FAILED",
      title: `Import failed: ${source.name}`,
      body: message,
      data: { sourceId: source.id, runId: run.id },
    });
    incrementCounter("okauto_import_runs_total", { result: "FAILED" });
    throw new Error(`Import run failed for source ${source.id}: ${message}`);
  };

  if (source.type !== "JSON_FEED") {
    return failRun(`Source type ${source.type} cannot be run by the worker`);
  }
  const feedUrl = (source.config as { feedUrl?: string }).feedUrl;
  if (!feedUrl) return failRun("Source is missing config.feedUrl");

  let rawItems: unknown[];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.IMPORT_HTTP_TIMEOUT_MS);
    const headers: Record<string, string> = { accept: "application/json" };
    const authHeader = (source.config as { feedAuthHeader?: string }).feedAuthHeader;
    if (authHeader) headers.authorization = authHeader;
    const res = await fetch(feedUrl, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!res.ok) return failRun(`Feed responded ${res.status}`);
    const json = (await res.json()) as unknown;
    if (Array.isArray(json)) rawItems = json;
    else if (json && typeof json === "object") {
      const obj = json as { items?: unknown; vehicles?: unknown; inventory?: unknown };
      const candidate = obj.items ?? obj.vehicles ?? obj.inventory;
      if (!Array.isArray(candidate)) return failRun("Feed JSON has no items/vehicles array");
      rawItems = candidate;
    } else {
      return failRun("Feed did not return JSON");
    }
  } catch (err) {
    return failRun(err instanceof Error ? err.message : "Feed fetch failed");
  }

  const items: ReturnType<typeof jsonFeedItemSchema.parse>[] = [];
  const preErrors: { index: number; message: string }[] = [];
  rawItems.forEach((raw, index) => {
    const parsed = jsonFeedItemSchema.safeParse(raw);
    if (parsed.success) items.push(parsed.data);
    else preErrors.push({ index, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  });
  const stats = await applyImportItems(db, items, {
    orgId: source.orgId,
    sourceId: source.id,
    actor: { type: "SYSTEM", userId: params.triggeredById ?? null },
    maxPhotos: config.IMPORT_MAX_PHOTOS,
    hub,
  });
  stats.failed += preErrors.length;
  stats.errors = [...preErrors, ...stats.errors];

  const status = stats.failed === 0 ? "SUCCEEDED" : stats.created + stats.updated + stats.unchanged > 0 ? "PARTIAL" : "FAILED";
  await db.importRun.update({
    where: { id: run.id },
    data: { status, stats: stats as object, finishedAt: new Date() },
  });
  await db.importSource.update({
    where: { id: source.id },
    data: {
      lastRunAt: run.startedAt,
      lastStatus: status,
      lastError: stats.failed > 0 ? `${stats.failed} row(s) failed` : null,
    },
  });
  await notifyUserOrLeaders(db, hub, {
    orgId: source.orgId,
    type: status === "FAILED" ? "IMPORT_FAILED" : "IMPORT_COMPLETED",
    title: `Import ${status.toLowerCase()}: ${source.name}`,
    body: `created=${stats.created} updated=${stats.updated} unchanged=${stats.unchanged} failed=${stats.failed}`,
    data: { sourceId: source.id, runId: run.id, stats: stats as object },
  });
  incrementCounter("okauto_import_runs_total", { result: status });
  return { runId: run.id, status, stats };
}
