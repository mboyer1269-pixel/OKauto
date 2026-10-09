import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  emptyFieldsFromVinDecode,
  isRetryableVinDecodeError,
  shouldLogVinDecodeJobComplete,
  vehicleNeedsVinDecode,
  VIN_DECODE_BATCH_SIZE,
  VIN_DECODE_CONSECUTIVE_NETWORK_STOP,
  VIN_DECODE_GAP_MS,
  VIN_DECODE_MAX_ATTEMPTS,
  vinDecodeRetryDelayMs,
} from "@okauto/shared";

const findMany = vi.fn();
const update = vi.fn();
const count = vi.fn();

vi.mock("@okauto/database", () => ({
  prisma: {
    vehicle: {
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
      count: (...args: unknown[]) => count(...args),
    },
  },
}));

describe("VIN decode catch-up policy", () => {
  it("keeps a 50-per-run / ~1s gap so ~203 vehicles finish in about 5 minutes", () => {
    expect(VIN_DECODE_BATCH_SIZE).toBe(50);
    expect(VIN_DECODE_GAP_MS).toBeGreaterThanOrEqual(1000);
    const schedulerMinutes = Math.ceil(203 / VIN_DECODE_BATCH_SIZE);
    expect(schedulerMinutes).toBeLessThanOrEqual(5);
    expect(203 * VIN_DECODE_GAP_MS).toBeLessThan(4 * 60 * 1000);
  });

  it("is idempotent for a NIV already stamped", () => {
    expect(
      vehicleNeedsVinDecode({
        vin: "1GNEVHKW0RJ123456",
        vinDecodedAt: "2026-10-09T12:00:00.000Z",
        vinDecodedVin: "1GNEVHKW0RJ123456",
        trim: null,
      }),
    ).toBe(false);
  });

  it("never overwrites a dealer trim with vPIC", () => {
    const { patch } = emptyFieldsFromVinDecode(
      { trim: "AT4" },
      { vin: "1GKS2BKC1FR123456", trim: "SLE" },
    );
    expect(patch.trim).toBeUndefined();
  });

  it("retries HTTP outages only", () => {
    expect(isRetryableVinDecodeError("NHTSA API error: 502")).toBe(true);
    expect(isRetryableVinDecodeError("fetch failed")).toBe(true);
    expect(isRetryableVinDecodeError("Check Digit")).toBe(false);
  });

  it("grows the retry delay and abandons after N attempts", () => {
    expect(vinDecodeRetryDelayMs(0)).toBe(VIN_DECODE_GAP_MS);
    expect(vinDecodeRetryDelayMs(1)).toBe(VIN_DECODE_GAP_MS * 2);
    expect(VIN_DECODE_MAX_ATTEMPTS).toBe(5);
    expect(VIN_DECODE_CONSECUTIVE_NETWORK_STOP).toBe(3);
  });

  it("logs job completion only when vehicles were scanned", () => {
    expect(shouldLogVinDecodeJobComplete({ scanned: 0 })).toBe(false);
    expect(shouldLogVinDecodeJobComplete({ scanned: 4 })).toBe(true);
    expect(shouldLogVinDecodeJobComplete(undefined)).toBe(false);
  });

  it("ships a compiled CLI entry in the worker image", () => {
    const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["vin-decode"]).toBe("node dist/vin-decode-cli.js");
    expect(pkg.scripts.build).toContain("vin-decode-cli.ts");
    expect(pkg.scripts.build).toContain("--outdir=dist");
  });
});

describe("processVinDecodeBatch queueing", () => {
  beforeEach(() => {
    findMany.mockReset();
    update.mockReset();
    count.mockReset();
    count.mockResolvedValue(0);
    update.mockResolvedValue({});
  });

  it("does not stamp vinDecodedAt when fetch failed, sorts by attempts, and stops after 3 network failures", async () => {
    const { processVinDecodeBatch } = await import("../vin-decode.js");
    const vehicles = [0, 1, 2, 3].map((attempts) => ({
      id: `v-${attempts}`,
      vin: "1GNEVHKW0RJ123456",
      vinDecodedAt: null,
      vinDecodedVin: null,
      vinDecodeAttempts: attempts === 3 ? 0 : 0,
      createdAt: new Date(Date.UTC(2026, 0, 1 + attempts)),
      year: 2024,
      make: "GMC",
      model: null,
      trim: "SLE",
      engine: null,
      bodyStyle: null,
      fuelType: null,
      transmission: null,
      drivetrain: null,
      doors: null,
      cylinders: null,
      status: "AVAILABLE",
    }));
    findMany.mockResolvedValue(vehicles);

    const result = await processVinDecodeBatch({
      delayMs: 0,
      consecutiveNetworkStop: 3,
      decodeVinFn: async () => ({
        vin: "1GNEVHKW0RJ123456",
        error: "fetch failed",
        retryable: true,
      }),
      sleepFn: async () => undefined,
    });

    expect(result.failed).toBe(3);
    expect(result.stoppedAfterConsecutiveNetworkFailures).toBe(true);
    expect(update).toHaveBeenCalledTimes(3);
    for (const call of update.mock.calls) {
      const data = call[0].data as { vinDecodedAt?: Date };
      expect(data.vinDecodedAt).toBeUndefined();
      expect(call[0].data.vinDecodeError).toMatch(/fetch failed/i);
    }
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { vinDecodeAttempts: "asc" },
      { createdAt: "asc" },
    ]);
  });

  it("abandons a NIV after max retryable attempts and records vinDecodeError", async () => {
    const { processVinDecodeBatch } = await import("../vin-decode.js");
    findMany.mockResolvedValue([
      {
        id: "stuck",
        vin: "1GNEVHKW0RJ123456",
        vinDecodedAt: null,
        vinDecodedVin: null,
        vinDecodeAttempts: 4,
        createdAt: new Date(),
        year: 2024,
        make: "GMC",
        model: null,
        trim: null,
        engine: null,
        bodyStyle: null,
        fuelType: null,
        transmission: null,
        drivetrain: null,
        doors: null,
        cylinders: null,
        status: "AVAILABLE",
      },
    ]);

    await processVinDecodeBatch({
      delayMs: 0,
      maxAttempts: 5,
      decodeVinFn: async () => ({
        vin: "1GNEVHKW0RJ123456",
        error: "NHTSA API error: 503",
        retryable: true,
      }),
      sleepFn: async () => undefined,
    });

    expect(update.mock.calls[0][0].data.vinDecodeAttempts).toBe(5);
    expect(update.mock.calls[0][0].data.vinDecodedAt).toBeInstanceOf(Date);
    expect(update.mock.calls[0][0].data.vinDecodeError).toMatch(/503/);
  });
});
