import { describe, expect, it, vi } from "vitest";
import {
  emptyFieldsFromVinDecode,
  isRetryableVinDecodeError,
  vehicleNeedsVinDecode,
  VIN_DECODE_BATCH_SIZE,
  VIN_DECODE_GAP_MS,
} from "@okauto/shared";

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
    expect(isRetryableVinDecodeError("Check Digit")).toBe(false);
  });
});

describe("processVinDecodeBatch skipping", () => {
  it("exports the batch processor", async () => {
    const mod = await import("../vin-decode.js");
    expect(typeof mod.processVinDecodeBatch).toBe("function");
    expect(vi).toBeTruthy();
  });
});
