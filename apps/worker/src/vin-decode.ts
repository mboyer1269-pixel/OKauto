import { prisma } from "@okauto/database";
import {
  decodeVin,
  emptyFieldsFromVinDecode,
  isRetryableVinDecodeError,
  isValidVinFormat,
  normalizeVin,
  vehicleNeedsVinDecode,
  VIN_DECODE_BATCH_SIZE,
  VIN_DECODE_GAP_MS,
  type VinDecodeResult,
} from "@okauto/shared";

export interface VinDecodeBatchResult {
  scanned: number;
  decoded: number;
  filled: number;
  skipped: number;
  failed: number;
  remaining: number;
}

const pendingStatuses = ["AVAILABLE", "PENDING"] as const;

const pendingVinDecodeWhere = {
  vin: { not: null },
  vinDecodedAt: null,
  status: { in: [...pendingStatuses] },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function countPendingVinDecodes(): Promise<number> {
  return prisma.vehicle.count({ where: pendingVinDecodeWhere });
}

/**
 * Idempotent catch-up: vehicles already stamped with `vinDecodedAt` for the
 * current NIV are ignored. Empty fields only — dealer/sync values win.
 *
 * Rate: one vPIC call every `delayMs` (default 1.1s). For ~203 vehicles at
 * 50/run and 1 run/minute, wall clock is about 5 minutes.
 */
export async function processVinDecodeBatch(options?: {
  limit?: number;
  delayMs?: number;
  vehicleIds?: string[];
  decodeVinFn?: (vin: string) => Promise<VinDecodeResult>;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<VinDecodeBatchResult> {
  const limit = options?.limit ?? VIN_DECODE_BATCH_SIZE;
  const delayMs = options?.delayMs ?? VIN_DECODE_GAP_MS;
  const decode = options?.decodeVinFn ?? decodeVin;
  const wait = options?.sleepFn ?? sleep;

  const candidates = await prisma.vehicle.findMany({
    where: {
      ...pendingVinDecodeWhere,
      ...(options?.vehicleIds ? { id: { in: options.vehicleIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let decoded = 0;
  let filled = 0;
  let skipped = 0;
  let failed = 0;
  let vpicCalls = 0;

  for (const vehicle of candidates) {
    const vin = vehicle.vin ? normalizeVin(vehicle.vin) : "";

    if (!isValidVinFormat(vin)) {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { vinDecodedAt: new Date(), vinDecodedVin: vin || vehicle.vin },
      });
      skipped += 1;
      continue;
    }

    if (
      vehicle.vinDecodedVin &&
      normalizeVin(vehicle.vinDecodedVin) === vin &&
      vehicle.vinDecodedAt
    ) {
      skipped += 1;
      continue;
    }

    if (!vehicleNeedsVinDecode(vehicle)) {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { vinDecodedAt: new Date(), vinDecodedVin: vin },
      });
      skipped += 1;
      continue;
    }

    if (vpicCalls > 0 && delayMs > 0) {
      await wait(delayMs);
    }

    const result = await decode(vin);
    vpicCalls += 1;

    if (result.error) {
      if (isRetryableVinDecodeError(result.error)) {
        failed += 1;
        continue;
      }
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { vinDecodedAt: new Date(), vinDecodedVin: vin },
      });
      skipped += 1;
      continue;
    }

    const { patch, filled: filledFields } = emptyFieldsFromVinDecode(
      vehicle,
      result,
    );
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        year: patch.year as number | undefined,
        make: patch.make as string | undefined,
        model: patch.model as string | undefined,
        trim: patch.trim as string | undefined,
        bodyStyle: patch.bodyStyle as string | undefined,
        engine: patch.engine as string | undefined,
        fuelType: patch.fuelType as string | undefined,
        transmission: patch.transmission as string | undefined,
        drivetrain: patch.drivetrain as string | undefined,
        doors: patch.doors as number | undefined,
        cylinders: patch.cylinders as number | undefined,
        vinDecodedAt: new Date(),
        vinDecodedVin: vin,
      },
    });
    decoded += 1;
    if (filledFields.length > 0) filled += 1;
    else skipped += 1;
  }

  const remaining = await countPendingVinDecodes();
  return {
    scanned: candidates.length,
    decoded,
    filled,
    skipped,
    failed,
    remaining,
  };
}

/** Loop until the backlog is empty or a retryable vPIC outage stops progress. */
export async function processVinDecodeUntilIdle(options?: {
  limit?: number;
  delayMs?: number;
  maxBatches?: number;
}): Promise<VinDecodeBatchResult[]> {
  const results: VinDecodeBatchResult[] = [];
  const maxBatches = options?.maxBatches ?? 20;
  for (let i = 0; i < maxBatches; i += 1) {
    const result = await processVinDecodeBatch(options);
    results.push(result);
    if (result.scanned === 0 || result.remaining === 0) break;
    if (result.decoded === 0 && result.skipped === 0 && result.failed > 0) {
      break;
    }
  }
  return results;
}
