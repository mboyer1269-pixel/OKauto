import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@okauto/database";
import { processVinDecodeBatch } from "../vin-decode.js";

const testVin = "1GKS2CKJ8FR123456";

describe("processVinDecodeBatch", () => {
  let orgId: string;
  let vehicleId: string;

  beforeEach(async () => {
    const org = await prisma.organization.findFirst({
      where: { slug: "demo-motors" },
    });
    orgId = org!.id;
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: testVin,
        stockNumber: `VIN-DECODE-${Date.now()}`,
        year: 2021,
        make: "GMC",
        model: null,
        trim: "AT4",
        engine: null,
        status: "AVAILABLE",
      },
    });
    vehicleId = vehicle.id;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  });

  it("fills empty fields from vPIC, keeps dealer trim, and is safe to re-run", async () => {
    const decodeVinFn = vi.fn(async () => ({
      vin: testVin,
      year: 2015,
      make: "Chevrolet",
      model: "Yukon",
      trim: "SLE",
      engine: "5.3L V8",
      bodyStyle: "SUV",
    }));

    const first = await processVinDecodeBatch({
      limit: 50,
      delayMs: 0,
      vehicleIds: [vehicleId],
      decodeVinFn,
      sleepFn: async () => undefined,
    });

    expect(first.decoded).toBeGreaterThanOrEqual(1);
    expect(decodeVinFn).toHaveBeenCalledTimes(1);

    const enriched = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });
    expect(enriched?.year).toBe(2021);
    expect(enriched?.make).toBe("GMC");
    expect(enriched?.trim).toBe("AT4");
    expect(enriched?.model).toBe("Yukon");
    expect(enriched?.engine).toBe("5.3L V8");
    expect(enriched?.vinDecodedVin).toBe(testVin);
    expect(enriched?.vinDecodedAt).toBeTruthy();

    decodeVinFn.mockClear();
    const second = await processVinDecodeBatch({
      limit: 50,
      delayMs: 0,
      vehicleIds: [vehicleId],
      decodeVinFn,
      sleepFn: async () => undefined,
    });
    expect(second.decoded).toBe(0);
    expect(decodeVinFn).not.toHaveBeenCalled();
  });

  it("never stamps a vehicle when fetch throws fetch failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: { code: "ECONNRESET" },
        });
      }),
    );

    const result = await processVinDecodeBatch({
      limit: 50,
      delayMs: 0,
      vehicleIds: [vehicleId],
      sleepFn: async () => undefined,
    });

    expect(result.failed).toBe(1);
    expect(result.decoded).toBe(0);
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    expect(vehicle?.vinDecodedAt).toBeNull();
    expect(vehicle?.model).toBeNull();
    expect(vehicle?.vinDecodeAttempts).toBe(1);
    expect(vehicle?.vinDecodeError).toMatch(/fetch failed/i);
  });
});
