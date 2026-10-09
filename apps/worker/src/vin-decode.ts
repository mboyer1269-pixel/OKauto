import { prisma } from "@okauto/database";
import {
  decodeVin,
  emptyFieldsFromVinDecode,
  isValidVinFormat,
  normalizeVin,
  vehicleNeedsVinDecode,
  vinDecodeIsRetryable,
  VIN_DECODE_BATCH_SIZE,
  VIN_DECODE_CONSECUTIVE_NETWORK_STOP,
  VIN_DECODE_GAP_MS,
  VIN_DECODE_MAX_ATTEMPTS,
  vinDecodeRetryDelayMs,
  type VinDecodeResult,
} from "@okauto/shared";

export interface VinDecodeBatchResult {
  scanned: number;
  decoded: number;
  filled: number;
  skipped: number;
  failed: number;
  remaining: number;
  stoppedAfterConsecutiveNetworkFailures?: boolean;
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

function clipError(error?: string): string {
  const text = (error ?? "VIN decode failed").replace(/\s+/g, " ").trim();
  return text.slice(0, 500);
}

export async function countPendingVinDecodes(): Promise<number> {
  return prisma.vehicle.count({ where: pendingVinDecodeWhere });
}

/**
 * Idempotent catch-up: vehicles already stamped with `vinDecodedAt` for the
 * current NIV are ignored. Empty fields only — dealer/sync values win.
 *
 * Rate: one vPIC call every `delayMs` (default 1.1s), growing after retries.
 * Sort by attempts so a handful of failing NIVs never block the rest.
 * Stop the batch after 3 consecutive network failures.
 */
export async function processVinDecodeBatch(options?: {
  limit?: number;
  delayMs?: number;
  vehicleIds?: string[];
  decodeVinFn?: (vin: string) => Promise<VinDecodeResult>;
  sleepFn?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  consecutiveNetworkStop?: number;
}): Promise<VinDecodeBatchResult> {
  const limit = options?.limit ?? VIN_DECODE_BATCH_SIZE;
  const delayMs = options?.delayMs ?? VIN_DECODE_GAP_MS;
  const decode = options?.decodeVinFn ?? decodeVin;
  const wait = options?.sleepFn ?? sleep;
  const maxAttempts = options?.maxAttempts ?? VIN_DECODE_MAX_ATTEMPTS;
  const consecutiveNetworkStop =
    options?.consecutiveNetworkStop ?? VIN_DECODE_CONSECUTIVE_NETWORK_STOP;

  const candidates = await prisma.vehicle.findMany({
    where: {
      ...pendingVinDecodeWhere,
      ...(options?.vehicleIds ? { id: { in: options.vehicleIds } } : {}),
    },
    orderBy: [{ vinDecodeAttempts: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  let decoded = 0;
  let filled = 0;
  let skipped = 0;
  let failed = 0;
  let vpicCalls = 0;
  let consecutiveNetworkFailures = 0;
  let stoppedAfterConsecutiveNetworkFailures = false;

  for (const vehicle of candidates) {
    const vin = vehicle.vin ? normalizeVin(vehicle.vin) : "";

    if (!isValidVinFormat(vin)) {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          vinDecodedAt: new Date(),
          vinDecodedVin: vin || vehicle.vin,
          vinDecodeError: "Invalid VIN format",
        },
      });
      skipped += 1;
      consecutiveNetworkFailures = 0;
      continue;
    }

    if (
      vehicle.vinDecodedVin &&
      normalizeVin(vehicle.vinDecodedVin) === vin &&
      vehicle.vinDecodedAt
    ) {
      skipped += 1;
      consecutiveNetworkFailures = 0;
      continue;
    }

    if (!vehicleNeedsVinDecode(vehicle)) {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          vinDecodedAt: new Date(),
          vinDecodedVin: vin,
          vinDecodeAttempts: 0,
          vinDecodeError: null,
        },
      });
      skipped += 1;
      consecutiveNetworkFailures = 0;
      continue;
    }

    const waitMs = vinDecodeRetryDelayMs(vehicle.vinDecodeAttempts ?? 0, delayMs);
    if (vpicCalls > 0 && waitMs > 0) {
      await wait(waitMs);
    }

    const result = await decode(vin);
    vpicCalls += 1;

    if (result.error) {
      if (vinDecodeIsRetryable(result)) {
        const attempts = (vehicle.vinDecodeAttempts ?? 0) + 1;
        const abandoned = attempts >= maxAttempts;
        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: {
            vinDecodeAttempts: attempts,
            vinDecodeError: clipError(result.error),
            ...(abandoned
              ? { vinDecodedAt: new Date(), vinDecodedVin: vin }
              : {}),
          },
        });
        failed += 1;
        consecutiveNetworkFailures += 1;
        if (consecutiveNetworkFailures >= consecutiveNetworkStop) {
          stoppedAfterConsecutiveNetworkFailures = true;
          break;
        }
        continue;
      }
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          vinDecodedAt: new Date(),
          vinDecodedVin: vin,
          vinDecodeError: clipError(result.error),
        },
      });
      skipped += 1;
      consecutiveNetworkFailures = 0;
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
        vinDecodeAttempts: 0,
        vinDecodeError: null,
      },
    });
    decoded += 1;
    consecutiveNetworkFailures = 0;
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
    stoppedAfterConsecutiveNetworkFailures,
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
    if (result.stoppedAfterConsecutiveNetworkFailures) break;
  }
  return results;
}
