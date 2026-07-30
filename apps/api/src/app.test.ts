import { describe, expect, it } from "vitest";
import { buildTemplateDescription, hasPermission } from "@okauto/shared";

describe("api shared integration smoke", () => {
  it("salesperson can write listings", () => {
    expect(hasPermission("salesperson", "listings:write")).toBe(true);
  });

  it("template description is non-empty", () => {
    const d = buildTemplateDescription({
      year: 2020,
      make: "Ford",
      model: "Escape",
      priceCents: 1800000,
    });
    expect(d.length).toBeGreaterThan(20);
  });
});
