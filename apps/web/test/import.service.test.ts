import { beforeEach, describe, expect, it, vi } from 'vitest';

/** In-memory prisma mock for the vehicle table used by the import service. */
const store: { vehicles: Array<Record<string, unknown>> } = { vehicles: [] };
let idSeq = 1;

vi.mock('@okauto/db', () => ({
  prisma: {
    vehicle: {
      findMany: vi.fn(async () => store.vehicles),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `v${idSeq++}`, ...data };
        store.vehicles.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.vehicles.find((v) => v.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));

import { importVehicles, parseImportContent } from '@/lib/services/vehicles';

beforeEach(() => {
  store.vehicles = [];
  idSeq = 1;
});

describe('importVehicles', () => {
  it('creates new vehicles and reports per-row status', async () => {
    const rows = parseImportContent(
      'csv',
      'vin,year,make,model,price\n1HGCM82633A004352,2003,Honda,Accord,8995\n,2018,Toyota,RAV4,18995',
    );
    const outcome = await importVehicles('org1', rows);
    expect(outcome.createdCount).toBe(2);
    expect(outcome.errorCount).toBe(0);
    expect(outcome.results[0]?.status).toBe('created');
  });

  it('updates existing vehicles matched by VIN', async () => {
    await importVehicles('org1', [{ vin: '1HGCM82633A004352', year: 2003, make: 'Honda', model: 'Accord', price: 8995 }]);
    const outcome = await importVehicles('org1', [
      { vin: '1hgcm82633a004352', year: 2003, make: 'Honda', model: 'Accord', price: 7995 },
    ]);
    expect(outcome.updatedCount).toBe(1);
    expect(outcome.createdCount).toBe(0);
    expect(store.vehicles[0]?.priceCents).toBe(799500);
  });

  it('flags duplicates within the same file', async () => {
    const outcome = await importVehicles('org1', [
      { stockNumber: 'A1', year: 2019, make: 'Ford', model: 'F-150', price: 30000 },
      { stockNumber: 'A1', year: 2019, make: 'Ford', model: 'F-150', price: 31000 },
    ]);
    expect(outcome.createdCount).toBe(1);
    expect(outcome.duplicateCount).toBe(1);
  });

  it('reports rows missing identifying fields as errors', async () => {
    const outcome = await importVehicles('org1', [{ price: 1000 }]);
    expect(outcome.errorCount).toBe(1);
    expect(outcome.results[0]?.status).toBe('error');
  });
});
