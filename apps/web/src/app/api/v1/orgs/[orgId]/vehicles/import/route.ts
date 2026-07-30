import { parseCsvWithHeaders } from "@lotpilot/core";
import { prisma, runSourceSync } from "@lotpilot/db";
import { audit, badRequest, handler, json, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string }> };

const MAX_CSV_BYTES = 10 * 1024 * 1024;

/**
 * CSV inventory import. Accepts multipart form-data with a `file` field (and
 * optional `sourceName`), or a raw text/csv body. Rows flow through the same
 * sync engine as scheduled feeds, so dedupe/price-change/sold logic is identical.
 */
export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");

  let csvText: string;
  let sourceName = "CSV upload";
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("Attach the CSV as a form field named 'file'");
    if (file.size > MAX_CSV_BYTES) throw badRequest("CSV exceeds the 10 MB limit");
    csvText = await file.text();
    const providedName = form.get("sourceName");
    if (typeof providedName === "string" && providedName.trim() !== "") sourceName = providedName.trim();
  } else if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
    csvText = await req.text();
    if (csvText.length > MAX_CSV_BYTES) throw badRequest("CSV exceeds the 10 MB limit");
  } else {
    throw badRequest("Send multipart/form-data with a 'file' field or a text/csv body");
  }

  const { headers, records } = parseCsvWithHeaders(csvText);
  if (records.length === 0) throw badRequest("The CSV contains no data rows");
  if (records.length > 5000) throw badRequest("CSV imports are limited to 5,000 rows per upload");

  // Reuse (or create) the org's CSV upload source so repeated uploads share
  // history, dedupe state, and sold detection.
  let source = await prisma.inventorySource.findFirst({
    where: { organizationId: orgId, type: "CSV_UPLOAD" },
  });
  if (!source) {
    source = await prisma.inventorySource.create({
      data: {
        organizationId: orgId,
        name: sourceName,
        type: "CSV_UPLOAD",
        fieldMapping: {},
        scheduleMinutes: 0,
        status: "ACTIVE",
      },
    });
  }

  const outcome = await runSourceSync(prisma, source, records, { trigger: "import" });
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "vehicles.import_csv",
    entityType: "sync_run",
    entityId: outcome.runId,
    data: { rows: records.length, headers, stats: { ...outcome.stats, errors: outcome.stats.errors.length } },
  });

  return json(
    { runId: outcome.runId, status: outcome.status, stats: outcome.stats, error: outcome.error },
    { status: outcome.status === "SUCCESS" ? 200 : 422 },
  );
});
