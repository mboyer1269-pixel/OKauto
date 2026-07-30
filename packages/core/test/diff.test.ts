import { describe, expect, it } from "vitest";
import { computeSyncDiff, type ExistingVehicleSnapshot } from "../src/diff.js";
import { normalizeVehicle, type NormalizedVehicle } from "../src/normalize.js";

function incoming(partial: Record<string, unknown>): NormalizedVehicle {
  const result = normalizeVehicle({ make: "Honda", model: "Accord", ...partial });
  if ("error" in result) throw new Error(result.error);
  return result;
}

function existing(partial: Partial<ExistingVehicleSnapshot>): ExistingVehicleSnapshot {
  return {
    id: "v1",
    vin: null,
    stockNumber: null,
    year: 2003,
    make: "Honda",
    model: "Accord",
    mileage: null,
    priceCents: 899_500,
    status: "AVAILABLE",
    missingSinceSyncs: 0,
    ...partial,
  };
}

describe("computeSyncDiff", () => {
  it("classifies creates, updates, and price changes", () => {
    const db = [existing({ id: "a", vin: "1HGCM82633A004352" })];
    const feed = [
      incoming({ vin: "1HGCM82633A004352", priceCents: 849_500 }),
      incoming({ vin: "5YJ3E1EAXKF317231", make: "Tesla", model: "Model 3" }),
    ];
    const diff = computeSyncDiff(db, feed, { soldThreshold: 2 });
    expect(diff.creates).toHaveLength(1);
    expect(diff.creates[0]?.model).toBe("Model 3");
    expect(diff.updates).toHaveLength(1);
    expect(diff.priceChanges).toEqual([
      expect.objectContaining({ oldPriceCents: 899_500, newPriceCents: 849_500 }),
    ]);
    expect(diff.missing).toHaveLength(0);
  });

  it("marks missing vehicles and applies the consecutive-sold threshold", () => {
    const notYet = existing({ id: "a", vin: "1HGCM82633A004352", missingSinceSyncs: 0 });
    const ready = existing({ id: "b", vin: "5YJ3E1EAXKF317231", missingSinceSyncs: 1 });
    const diff = computeSyncDiff([notYet, ready], [], { soldThreshold: 2 });
    expect(diff.missing.map((m) => m.id).sort()).toEqual(["a", "b"]);
    expect(diff.toMarkSold.map((m) => m.id)).toEqual(["b"]);
  });

  it("ignores already-sold/archived vehicles for missing detection", () => {
    const sold = existing({ id: "a", status: "SOLD" });
    const diff = computeSyncDiff([sold], [], { soldThreshold: 1 });
    expect(diff.missing).toHaveLength(0);
    expect(diff.toMarkSold).toHaveLength(0);
  });

  it("dedupes incoming records so one feed row cannot double-create", () => {
    const feed = [
      incoming({ vin: "1HGCM82633A004352", priceCents: 100_000 }),
      incoming({ vin: "1HGCM82633A004352", priceCents: 120_000 }),
    ];
    const diff = computeSyncDiff([], feed, { soldThreshold: 2 });
    expect(diff.creates).toHaveLength(1);
    expect(diff.creates[0]?.priceCents).toBe(120_000);
  });

  it("does not flag a price change when either side lacks a price", () => {
    const db = [existing({ id: "a", vin: "1HGCM82633A004352", priceCents: null })];
    const feed = [incoming({ vin: "1HGCM82633A004352", priceCents: 500_000 })];
    const diff = computeSyncDiff(db, feed, { soldThreshold: 2 });
    expect(diff.priceChanges).toHaveLength(0);
    expect(diff.updates).toHaveLength(1);
  });
});
