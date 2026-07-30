import { describe, expect, it } from "vitest";
import { normalizeVin } from "@okauto/shared";

describe("worker utils", () => {
  it("normalizes vin", () => {
    expect(normalizeVin("1hgcm82633a004352")).toHaveLength(17);
  });
});
