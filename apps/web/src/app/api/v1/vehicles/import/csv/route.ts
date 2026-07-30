import { prisma } from '@okauto/database';
import { withAuth, jsonResponse, parseBody } from '@/lib/api';

const CSV_COLUMNS = [
  'vin', 'stockNumber', 'year', 'make', 'model', 'trim', 'mileage', 'price',
  'exteriorColor', 'interiorColor', 'transmission', 'fuelType', 'bodyStyle', 'description',
];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export const POST = withAuth(
  async (request, { auth }) => {
    const body = await parseBody<{ csv: string }>(request);
    if (!body.csv) return jsonResponse({ error: 'CSV content required' }, 400);

    const lines = body.csv.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return jsonResponse({ error: 'CSV must have header and at least one row' }, 400);

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ''));
    const rows = lines.slice(1);

    const job = await prisma.importJob.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.sub,
        status: 'PROCESSING',
        source: 'csv',
        totalRows: rows.length,
        startedAt: new Date(),
      },
    });

    const errors: Array<{ row: number; error: string }> = [];
    let successCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const values = parseCsvLine(rows[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });

      try {
        const vin = row.vin || row.vinnumber || undefined;
        const year = row.year ? parseInt(row.year, 10) : undefined;
        const mileage = row.mileage ? parseInt(row.mileage.replace(/,/g, ''), 10) : undefined;
        const price = row.price ? parseFloat(row.price.replace(/[$,]/g, '')) : undefined;

        await prisma.vehicle.create({
          data: {
            organizationId: auth.orgId,
            vin: vin || null,
            stockNumber: row.stocknumber || row.stock || null,
            year: isNaN(year!) ? null : year,
            make: row.make || null,
            model: row.model || null,
            trim: row.trim || null,
            mileage: isNaN(mileage!) ? null : mileage,
            price: isNaN(price!) ? null : price,
            exteriorColor: row.exteriorcolor || row.color || null,
            interiorColor: row.interiorcolor || null,
            transmission: row.transmission || null,
            fuelType: row.fueltype || row.fuel || null,
            bodyStyle: row.bodystyle || null,
            description: row.description || null,
            status: 'AVAILABLE',
          },
        });
        successCount++;
      } catch (err) {
        errors.push({ row: i + 2, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    const updatedJob = await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: errors.length === 0 ? 'COMPLETED' : errors.length < rows.length ? 'PARTIAL' : 'FAILED',
        processedRows: rows.length,
        successCount,
        errorCount: errors.length,
        errors: errors as never,
        completedAt: new Date(),
      },
    });

    return jsonResponse({
      job: updatedJob,
      imported: successCount,
      errors,
    });
  },
  { minRole: 'MANAGER' }
);

export const GET = withAuth(async (_request, { auth }) => {
  const jobs = await prisma.importJob.findMany({
    where: { organizationId: auth.orgId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { user: { select: { id: true, name: true } } },
  });
  return jsonResponse(jobs);
});
