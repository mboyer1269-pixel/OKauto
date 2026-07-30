import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: string;
  [k: string]: unknown;
}
const db = {
  vehicles: [] as Row[],
  listings: [] as Row[],
  notifications: [] as Row[],
};

vi.mock('@okauto/db', () => ({
  prisma: {
    vehicle: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        db.vehicles.find((v) => v.id === where.id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.vehicles.find((v) => v.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    listing: {
      findMany: vi.fn(async ({ where }: { where: { vehicleId: string; status: { in: string[] } } }) =>
        db.listings.filter((l) => l.vehicleId === where.vehicleId && where.status.in.includes(l.status as string)),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.listings.find((l) => l.id === where.id)!;
        // Ignore nested events writes in the mock.
        const { events: _events, ...rest } = data;
        Object.assign(row, rest);
        return row;
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `n${db.notifications.length + 1}`, ...data };
        db.notifications.push(row);
        return row;
      }),
    },
  },
}));

import { markVehicleSold, repriceVehicle } from '@/lib/services/listings';

beforeEach(() => {
  db.vehicles = [{ id: 'veh1', title: '2020 Ford F-150', priceCents: 3000000, status: 'AVAILABLE' }];
  db.listings = [
    { id: 'lst1', vehicleId: 'veh1', organizationId: 'org1', listerId: 'user1', status: 'ACTIVE' },
    { id: 'lst2', vehicleId: 'veh1', organizationId: 'org1', listerId: 'user2', status: 'REMOVED' },
  ];
  db.notifications = [];
});

describe('markVehicleSold', () => {
  it('flags active listings and notifies listers', async () => {
    const flagged = await markVehicleSold('veh1');
    expect(flagged).toBe(1);
    expect(db.vehicles[0]?.status).toBe('SOLD');
    expect(db.listings.find((l) => l.id === 'lst1')?.status).toBe('NEEDS_ATTENTION');
    expect(db.listings.find((l) => l.id === 'lst2')?.status).toBe('REMOVED');
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]?.type).toBe('SOLD_ALERT');
  });
});

describe('repriceVehicle', () => {
  it('updates price and notifies on active listings', async () => {
    const flagged = await repriceVehicle('veh1', 2800000);
    expect(flagged).toBe(1);
    expect(db.vehicles[0]?.priceCents).toBe(2800000);
    expect(db.notifications[0]?.type).toBe('PRICE_CHANGE');
  });

  it('does nothing when price is unchanged', async () => {
    const flagged = await repriceVehicle('veh1', 3000000);
    expect(flagged).toBe(0);
    expect(db.notifications).toHaveLength(0);
  });
});
