import { describe, expect, it } from "vitest";
import { buildHeaderIndex, parseCsv, parseCsvWithHeaders, pickField, toCsv } from "../src/csv.js";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas, quotes and newlines", () => {
    const text = 'name,notes\r\n"Smith, John","He said ""hi""\nsecond line"';
    expect(parseCsv(text)).toEqual([
      ["name", "notes"],
      ["Smith, John", 'He said "hi"\nsecond line'],
    ]);
  });

  it("strips BOM and skips empty trailing lines", () => {
    expect(parseCsv("\uFEFFa,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvWithHeaders", () => {
  it("maps records by header", () => {
    const { headers, records } = parseCsvWithHeaders("VIN,Price\nABC,1000");
    expect(headers).toEqual(["VIN", "Price"]);
    expect(records).toEqual([{ VIN: "ABC", Price: "1000" }]);
  });
});

describe("pickField", () => {
  it("resolves case/punctuation-insensitive aliases", () => {
    const headers = ["Stock #", "Ext. Color"];
    const idx = buildHeaderIndex(headers);
    const rec = { "Stock #": "A123", "Ext. Color": "Blue" };
    expect(pickField(rec, idx, ["stock number", "stock #"])).toBe("A123");
    expect(pickField(rec, idx, ["ext color", "exterior color"])).toBe("Blue");
    expect(pickField(rec, idx, ["missing"])).toBeUndefined();
  });
});

describe("toCsv", () => {
  it("round-trips values requiring quoting", () => {
    const csv = toCsv([
      ["a", "b"],
      ['x"y', "1,2"],
    ]);
    expect(parseCsv(csv)).toEqual([
      ["a", "b"],
      ['x"y', "1,2"],
    ]);
  });
});
