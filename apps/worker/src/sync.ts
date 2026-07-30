import { prisma } from '@okauto/database';
import type { SyncVehicle } from '@okauto/shared';
import { parseSyncFeed } from '@okauto/shared';

export interface SyncResult {
  synced: number;
  errors: number;
  priceChanges: number;
}

export async function runSyncSource(syncSourceId: string): Promise<SyncResult> {
  const source = await prisma.syncSource.findUnique({ where: { id: syncSourceId } });
  if (!source) throw new Error('Sync source not found');

  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'OKauto-Sync/1.0', Accept: 'application/json, text/html' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get('content-type');
  const body = await response.text();
  const vehicles = parseSyncFeed(source.adapter, body, contentType);

  let successCount = 0;
  let errorCount = 0;
  let priceChanges = 0;

  for (const v of vehicles) {
    if (!v.vin) {
      errorCount++;
      continue;
    }

    try {
      const existing = await prisma.vehicle.findUnique({
        where: {
          organizationId_vin: { organizationId: source.organizationId, vin: v.vin },
        },
        select: { id: true, price: true },
      });

      const newPrice = v.price != null ? v.price : undefined;
      const oldPrice = existing?.price ? Number(existing.price) : null;

      const vehicle = await prisma.vehicle.upsert({
        where: {
          organizationId_vin: {
            organizationId: source.organizationId,
            vin: v.vin,
          },
        },
        create: {
          organizationId: source.organizationId,
          vin: v.vin,
          stockNumber: v.stockNumber,
          year: v.year,
          make: v.make,
          model: v.model,
          trim: v.trim,
          mileage: v.mileage,
          price: newPrice,
          exteriorColor: v.exteriorColor,
          interiorColor: v.interiorColor,
          description: v.description,
          transmission: v.transmission,
          fuelType: v.fuelType,
          drivetrain: v.drivetrain,
          engine: v.engine,
          bodyStyle: v.bodyStyle,
          status: mapStatus(v.status),
        },
        update: {
          stockNumber: v.stockNumber,
          year: v.year,
          make: v.make,
          model: v.model,
          trim: v.trim,
          mileage: v.mileage,
          price: newPrice,
          exteriorColor: v.exteriorColor,
          interiorColor: v.interiorColor,
          description: v.description,
          transmission: v.transmission,
          fuelType: v.fuelType,
          drivetrain: v.drivetrain,
          engine: v.engine,
          bodyStyle: v.bodyStyle,
          status: mapStatus(v.status),
        },
      });

      if (existing && oldPrice != null && newPrice != null && oldPrice !== newPrice) {
        priceChanges++;
        await notifyPriceChange(source.organizationId, vehicle.id, oldPrice, newPrice, v);
      }

      if (v.photos && v.photos.length > 0) {
        await syncVehiclePhotos(vehicle.id, v.photos);
      }

      successCount++;
    } catch (err) {
      console.warn('Sync vehicle error:', err);
      errorCount++;
    }
  }

  await prisma.syncSource.update({
    where: { id: syncSourceId },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: errorCount > 0 && successCount === 0 ? 'error' : 'success',
      lastSyncError: errorCount > 0 ? `${errorCount} vehicle(s) failed to sync` : null,
    },
  });

  return { synced: successCount, errors: errorCount, priceChanges };
}

function mapStatus(status?: string): 'AVAILABLE' | 'PENDING' | 'SOLD' | 'ARCHIVED' {
  const s = String(status ?? 'available').toLowerCase();
  if (s.includes('sold')) return 'SOLD';
  if (s.includes('pending')) return 'PENDING';
  if (s.includes('archived')) return 'ARCHIVED';
  return 'AVAILABLE';
}

async function syncVehiclePhotos(vehicleId: string, photoUrls: string[]) {
  const existing = await prisma.vehiclePhoto.count({ where: { vehicleId } });
  if (existing > 0) return;

  await prisma.vehiclePhoto.createMany({
    data: photoUrls.slice(0, 20).map((url, i) => ({
      vehicleId,
      url,
      sortOrder: i,
      isPrimary: i === 0,
    })),
  });
}

async function notifyPriceChange(
  organizationId: string,
  vehicleId: string,
  oldPrice: number,
  newPrice: number,
  vehicle: SyncVehicle
) {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId, role: { in: ['OWNER', 'ADMIN', 'MANAGER'] } },
    select: { userId: true },
  });

  const title = `${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim();
  for (const m of members) {
    await prisma.notification.create({
      data: {
        userId: m.userId,
        type: 'PRICE_CHANGE',
        title: 'Price Change Detected',
        message: `${title} (VIN ${vehicle.vin}) price changed from $${oldPrice.toLocaleString()} to $${newPrice.toLocaleString()}.`,
        metadata: { vehicleId, oldPrice, newPrice, vin: vehicle.vin },
      },
    });
  }
}
