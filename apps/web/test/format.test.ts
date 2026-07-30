import { describe, expect, it } from "vitest";
import { ApiClientError, formatDate, formatPrice } from "../src/lib/api";

describe("formatPrice", () => {
  it("formats cents as whole USD", () => {
    expect(formatPrice(2649900)).toBe("$26,499");
    expect(formatPrice(0)).toBe("$0");
  });
  it("renders a dash for missing prices", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
  });
});

describe("formatDate", () => {
  it("renders a dash for missing dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
  it("formats ISO timestamps", () => {
    expect(formatDate("2026-01-15T12:30:00Z")).toContain("2026");
  });
});

describe("ApiClientError", () => {
  it("carries status, code and details", () => {
    const err = new ApiClientError(422, "VALIDATION_ERROR", "Bad input", [{ path: "vin" }]);
    expect(err.status).toBe(422);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual([{ path: "vin" }]);
    expect(err).toBeInstanceOf(Error);
  });
});
