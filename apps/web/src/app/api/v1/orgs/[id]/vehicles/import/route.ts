import { prisma, type Prisma } from '@okauto/db';
import { importSchema } from '@okauto/shared';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { assertCan, requireOrgContext } from '@/lib/context';
import { importVehicles, parseImportContent } from '@/lib/services/vehicles';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser(req);
  const orgCtx = await requireOrgContext(user, id);
  assertCan(orgCtx, 'vehicle:import');

  const input = await parseJson(req, importSchema);
  let rows;
  try {
    rows = parseImportContent(input.format ?? 'csv', input.content);
  } catch (error) {
    throw httpErrors.badRequest(`Could not parse ${input.format}: ${String(error)}`);
  }
  if (rows.length === 0) throw httpErrors.badRequest('No rows found in import');
  if (rows.length > 2000) throw httpErrors.badRequest('Import is limited to 2000 rows per batch');

  const outcome = await importVehicles(id, rows);

  const batch = await prisma.importBatch.create({
    data: {
      organizationId: id,
      createdById: user.id,
      source: input.format,
      totalRows: outcome.totalRows,
      createdCount: outcome.createdCount,
      updatedCount: outcome.updatedCount,
      duplicateCount: outcome.duplicateCount,
      errorCount: outcome.errorCount,
      report: outcome.results as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.notification.create({
    data: {
      organizationId: id,
      userId: user.id,
      type: 'IMPORT_COMPLETE',
      title: 'Inventory import complete',
      body: `Created ${outcome.createdCount}, updated ${outcome.updatedCount}, duplicates ${outcome.duplicateCount}, errors ${outcome.errorCount}.`,
      metadata: { batchId: batch.id },
    },
  });

  await audit({
    organizationId: id,
    actorId: user.id,
    action: 'vehicle.import',
    targetType: 'importBatch',
    targetId: batch.id,
    metadata: {
      created: outcome.createdCount,
      updated: outcome.updatedCount,
      duplicates: outcome.duplicateCount,
      errors: outcome.errorCount,
    },
    ip: clientIp(req),
  });

  return jsonOk({ batchId: batch.id, ...outcome }, { status: 201 });
});
