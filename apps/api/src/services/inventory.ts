import { parse } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import type { VehicleType } from '@prisma/client';
import { prisma } from '../db.js';

export type ImportedVehicle = {
  externalId?: string;
  vin?: string;
  stockNumber?: string;
  vehicleType?: VehicleType;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  bodyStyle?: string;
  exteriorColor?: string;
  interiorColor?: string;
  mileage?: number;
  price?: number;
  description?: string;
  photoUrls?: string[];
};

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function mapRow(row: Record<string, unknown>, mapping?: Record<string, string>): ImportedVehicle {
  const get = (key: string) => {
    const mapped = mapping?.[key] ?? key;
    const found = Object.entries(row).find(([k]) => k.toLowerCase() === mapped.toLowerCase());
    return found?.[1];
  };
  const photos = str(get('photos') ?? get('photoUrls') ?? get('images'));
  return {
    externalId: str(get('externalId') ?? get('id')),
    vin: str(get('vin'))?.toUpperCase(),
    stockNumber: str(get('stockNumber') ?? get('stock')),
    year: num(get('year')),
    make: str(get('make')),
    model: str(get('model')),
    trim: str(get('trim')),
    bodyStyle: str(get('bodyStyle') ?? get('body')),
    exteriorColor: str(get('exteriorColor') ?? get('color')),
    interiorColor: str(get('interiorColor')),
    mileage: num(get('mileage') ?? get('odometer')),
    price: num(get('price')),
    description: str(get('description')),
    photoUrls: photos
      ? photos.split(/[|,;]/).map((p) => p.trim()).filter(Boolean)
      : undefined,
  };
}

export function parseCsvInventory(content: string, mapping?: Record<string, string>): ImportedVehicle[] {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];
  return records.map((r) => mapRow(r, mapping)).filter((v) => v.vin || v.stockNumber || v.make);
}

export function parseXmlInventory(content: string, mapping?: Record<string, string>): ImportedVehicle[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const doc = parser.parse(content) as Record<string, unknown>;
  const candidates =
    (doc as { vehicles?: { vehicle?: unknown } }).vehicles?.vehicle ??
    (doc as { inventory?: { vehicle?: unknown } }).inventory?.vehicle ??
    (doc as { rss?: { channel?: { item?: unknown } } }).rss?.channel?.item ??
    [];
  const arr = Array.isArray(candidates) ? candidates : [candidates];
  return arr
    .filter(Boolean)
    .map((item) => mapRow(item as Record<string, unknown>, mapping))
    .filter((v) => v.vin || v.stockNumber || v.make);
}

/** Best-effort public HTML inventory scrape — no auth bypass. */
export function parseWebsiteInventory(html: string, pageUrl: string): ImportedVehicle[] {
  const $ = cheerio.load(html);
  const vehicles: ImportedVehicle[] = [];
  const vinRe = /\b([A-HJ-NPR-Z0-9]{17})\b/gi;

  $('a, article, .vehicle, .inventory-item, [data-vin]').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const vinAttr = $(el).attr('data-vin') || $(el).attr('data-vehicle-vin');
    const vinMatch = vinAttr || text.match(vinRe)?.[0];
    if (!vinMatch && text.length < 20) return;

    const year = num(text.match(/\b(19|20)\d{2}\b/)?.[0]);
    const price = num(
      text.match(/\$\s?[\d,]+/)?.[0] || $(el).find('[class*="price"]').first().text(),
    );
    const mileage = num(text.match(/([\d,]+)\s*(mi|miles)/i)?.[1]);
    const img =
      $(el).find('img').first().attr('src') ||
      $(el).find('img').first().attr('data-src') ||
      undefined;
    const absImg = img ? new URL(img, pageUrl).toString() : undefined;

    if (vinMatch || (year && text.length > 30)) {
      vehicles.push({
        vin: vinMatch?.toUpperCase(),
        year,
        price,
        mileage,
        make: str($(el).attr('data-make')),
        model: str($(el).attr('data-model')),
        photoUrls: absImg ? [absImg] : undefined,
        description: text.slice(0, 500),
      });
    }
  });

  // Deduplicate by VIN
  const seen = new Set<string>();
  return vehicles.filter((v) => {
    const key = v.vin || `${v.year}-${v.make}-${v.model}-${v.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function upsertImportedVehicles(input: {
  dealershipId: string;
  sourceId: string;
  items: ImportedVehicle[];
}): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const seenIds: string[] = [];

  for (const item of input.items) {
    if (!item.vin && !item.stockNumber && !item.externalId) {
      skipped += 1;
      continue;
    }

    let existing = null as Awaited<ReturnType<typeof prisma.vehicle.findFirst>>;
    if (item.vin) {
      existing = await prisma.vehicle.findFirst({
        where: { dealershipId: input.dealershipId, vin: item.vin },
      });
    }
    if (!existing && item.externalId) {
      existing = await prisma.vehicle.findFirst({
        where: { dealershipId: input.dealershipId, externalId: item.externalId },
      });
    }
    if (!existing && item.stockNumber) {
      existing = await prisma.vehicle.findFirst({
        where: { dealershipId: input.dealershipId, stockNumber: item.stockNumber },
      });
    }

    const priceChanged =
      existing &&
      item.price != null &&
      existing.price != null &&
      Number(existing.price) !== item.price;

    if (existing) {
      const updatedVehicle = await prisma.vehicle.update({
        where: { id: existing.id },
        data: {
          sourceId: input.sourceId,
          externalId: item.externalId ?? existing.externalId,
          vin: item.vin ?? existing.vin,
          stockNumber: item.stockNumber ?? existing.stockNumber,
          year: item.year ?? existing.year,
          make: item.make ?? existing.make,
          model: item.model ?? existing.model,
          trim: item.trim ?? existing.trim,
          bodyStyle: item.bodyStyle ?? existing.bodyStyle,
          exteriorColor: item.exteriorColor ?? existing.exteriorColor,
          interiorColor: item.interiorColor ?? existing.interiorColor,
          mileage: item.mileage ?? existing.mileage,
          previousPrice: priceChanged ? existing.price : existing.previousPrice,
          price: item.price ?? existing.price,
          description: item.description ?? existing.description,
          status: existing.status === 'sold' ? 'available' : existing.status,
          lastSeenAt: new Date(),
        },
      });
      seenIds.push(updatedVehicle.id);
      if (item.photoUrls?.length) {
        await prisma.vehicleMedia.deleteMany({ where: { vehicleId: existing.id } });
        await prisma.vehicleMedia.createMany({
          data: item.photoUrls.map((url, i) => ({
            vehicleId: existing.id,
            url,
            sortOrder: i,
          })),
        });
      }
      if (priceChanged) {
        const listings = await prisma.listing.findMany({
          where: {
            vehicleId: existing.id,
            status: { in: ['prepared', 'filled', 'submitted', 'active'] },
          },
        });
        for (const listing of listings) {
          await prisma.listingEvent.create({
            data: {
              listingId: listing.id,
              type: 'price_changed',
              meta: { from: Number(existing.price), to: item.price },
            },
          });
          await prisma.notification.create({
            data: {
              userId: listing.salespersonId,
              type: 'price_change',
              title: 'Vehicle price changed',
              body: `${item.year ?? ''} ${item.make ?? ''} ${item.model ?? ''} price updated`.trim(),
              payload: { vehicleId: existing.id, listingId: listing.id, price: item.price },
            },
          });
        }
      }
      updated += 1;
    } else {
      const vehicle = await prisma.vehicle.create({
        data: {
          dealershipId: input.dealershipId,
          sourceId: input.sourceId,
          externalId: item.externalId,
          vin: item.vin,
          stockNumber: item.stockNumber,
          vehicleType: item.vehicleType ?? 'automotive',
          year: item.year,
          make: item.make,
          model: item.model,
          trim: item.trim,
          bodyStyle: item.bodyStyle,
          exteriorColor: item.exteriorColor,
          interiorColor: item.interiorColor,
          mileage: item.mileage,
          price: item.price,
          description: item.description,
          lastSeenAt: new Date(),
          media: item.photoUrls?.length
            ? {
                create: item.photoUrls.map((url, i) => ({ url, sortOrder: i })),
              }
            : undefined,
        },
      });
      seenIds.push(vehicle.id);
      created += 1;
    }
  }

  // Mark vehicles from this source not seen in this sync as sold (if they had been available/listed)
  const stale = await prisma.vehicle.findMany({
    where: {
      dealershipId: input.dealershipId,
      sourceId: input.sourceId,
      id: { notIn: seenIds },
      status: { in: ['available', 'listed', 'pending'] },
    },
  });

  for (const vehicle of stale) {
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: 'sold', soldAt: new Date() },
    });
    const listings = await prisma.listing.findMany({
      where: {
        vehicleId: vehicle.id,
        status: { in: ['prepared', 'filled', 'submitted', 'active'] },
      },
    });
    for (const listing of listings) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: { status: 'sold' },
      });
      await prisma.listingEvent.create({
        data: { listingId: listing.id, type: 'sold_detected', meta: { reason: 'missing_from_feed' } },
      });
      await prisma.notification.create({
        data: {
          userId: listing.salespersonId,
          type: 'sold_vehicle',
          title: 'Vehicle sold — remove Marketplace listing',
          body: `${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''} appears sold in inventory. Please remove your Marketplace listing.`.trim(),
          payload: { vehicleId: vehicle.id, listingId: listing.id },
        },
      });
    }
  }

  return { created, updated, skipped };
}
