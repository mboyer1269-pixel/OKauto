import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber, humanize, statusColor, timeAgo, vehicleName } from "./format";

describe("format helpers", () => {
  it("formats money from cents", () => {
    expect(formatMoney(2199500)).toBe("$21,995");
    expect(formatMoney(null)).toBe("—");
  });

  it("formats numbers with separators", () => {
    expect(formatNumber(98400)).toBe("98,400");
    expect(formatNumber(undefined)).toBe("—");
  });

  it("humanizes enum values", () => {
    expect(humanize("SUSPECTED_SOLD")).toBe("Suspected Sold");
    expect(humanize(null)).toBe("—");
  });

  it("builds vehicle display names", () => {
    expect(vehicleName({ year: 2021, make: "Toyota", model: "Camry", trim: "SE" })).toBe("2021 Toyota Camry SE");
    expect(vehicleName({ year: null, make: "Ford", model: "F-150" })).toBe("Ford F-150");
  });

  it("returns relative time", () => {
    expect(timeAgo(new Date(Date.now() - 30_000))).toBe("just now");
    expect(timeAgo(new Date(Date.now() - 90 * 60_000))).toBe("1h ago");
    expect(timeAgo(null)).toBe("—");
  });

  it("maps statuses to color classes with fallback", () => {
    expect(statusColor("LIVE")).toContain("emerald");
    expect(statusColor("WHATEVER")).toContain("ink");
  });
});
