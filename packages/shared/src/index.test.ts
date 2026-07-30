import { describe, expect, it } from "vitest";
import {
  centsToDollars,
  dollarsToCents,
  formatVehicleTitle,
  hasMinRole,
  registerSchema,
} from "./index.js";

describe("RBAC", () => {
  it("allows admin for manager-required actions", () => {
    expect(hasMinRole("ADMIN", "MANAGER")).toBe(true);
  });

  it("denies salesperson for admin actions", () => {
    expect(hasMinRole("SALESPERSON", "ADMIN")).toBe(false);
  });
});

describe("money helpers", () => {
  it("converts dollars and cents", () => {
    expect(dollarsToCents(19999.99)).toBe(1999999);
    expect(centsToDollars(1999999)).toBe("19999.99");
  });
});

describe("formatVehicleTitle", () => {
  it("joins year make model trim", () => {
    expect(
      formatVehicleTitle({
        year: 2021,
        make: "Toyota",
        model: "Camry",
        trim: "SE",
      }),
    ).toBe("2021 Toyota Camry SE");
  });
});

describe("registerSchema", () => {
  it("rejects short passwords", () => {
    const result = registerSchema.safeParse({
      email: "a@b.com",
      password: "short",
      name: "Alex",
      organizationName: "Lot One",
    });
    expect(result.success).toBe(false);
  });
});
