import { describe, expect, it } from "vitest";
import {
  bulkVehicleActionSchema,
  createVehicleSchema,
  jsonFeedItemSchema,
  listingTransitionSchema,
  registerSchema,
  vehicleQuerySchema,
} from "../src/schemas.js";

describe("registerSchema", () => {
  it("accepts valid input and defaults vertical", () => {
    const r = registerSchema.parse({
      email: "Owner@Example.com ",
      password: "super-secret-1",
      name: "Owner",
      orgName: "Demo Motors",
    });
    expect(r.email).toBe("owner@example.com");
    expect(r.vertical).toBe("AUTOMOTIVE");
  });
  it("rejects short passwords", () => {
    expect(() =>
      registerSchema.parse({ email: "a@b.co", password: "short", name: "A", orgName: "AB" }),
    ).toThrow();
  });
});

describe("createVehicleSchema", () => {
  it("coerces numeric strings from CSVs", () => {
    const v = createVehicleSchema.parse({
      year: "2020",
      make: "Ford",
      model: "F-150",
      mileage: "51200",
      priceCents: "2899500",
      photoUrls: ["https://cdn.example.com/1.jpg"],
    });
    expect(v.year).toBe(2020);
    expect(v.priceCents).toBe(2899500);
    expect(v.condition).toBe("USED");
  });
  it("requires make/model", () => {
    expect(() => createVehicleSchema.parse({ priceCents: 1 })).toThrow();
  });
});

describe("jsonFeedItemSchema", () => {
  it("accepts price in dollars as alias", () => {
    const item = jsonFeedItemSchema.parse({ make: "Kia", model: "K5", price: 25995 });
    expect(item.price).toBe(25995);
  });
});

describe("listingTransitionSchema", () => {
  it("validates target status", () => {
    expect(listingTransitionSchema.parse({ to: "LIVE" }).to).toBe("LIVE");
    expect(() => listingTransitionSchema.parse({ to: "PUBLISHED" })).toThrow();
  });
});

describe("bulkVehicleActionSchema", () => {
  it("discriminates actions", () => {
    const a = bulkVehicleActionSchema.parse({ action: "queue-listings", vehicleIds: ["v1"] });
    expect(a.action).toBe("queue-listings");
    expect(() => bulkVehicleActionSchema.parse({ action: "delete", vehicleIds: ["v1"] })).toThrow();
  });
});

describe("vehicleQuerySchema", () => {
  it("applies pagination defaults", () => {
    const q = vehicleQuerySchema.parse({});
    expect(q.limit).toBe(25);
  });
});
