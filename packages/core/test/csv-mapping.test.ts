import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvWithHeaders } from "../src/csv.js";
import { applyFieldMapping, DEFAULT_FIELD_MAPPING } from "../src/mapping.js";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, and embedded newlines/commas", () => {
    const text = 'a,b,c\n"1,5","he said ""hi""","line1\nline2"\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["1,5", 'he said "hi"', "line1\nline2"],
    ]);
  });

  it("handles CRLF and BOM", () => {
    expect(parseCsv("\uFEFFa,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops empty trailing rows", () => {
    expect(parseCsv("a,b\n1,2\n\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvWithHeaders", () => {
  it("zips headers with cells", () => {
    const { headers, records } = parseCsvWithHeaders("VIN,Price\nABC,1000\n");
    expect(headers).toEqual(["VIN", "Price"]);
    expect(records).toEqual([{ VIN: "ABC", Price: "1000" }]);
  });
});

describe("applyFieldMapping", () => {
  it("maps default DMS-style headers", () => {
    const mapped = applyFieldMapping(
      {
        VIN: "1HGCM82633A004352",
        Stock: "A1",
        Year: "2003",
        Make: "Honda",
        Model: "Accord",
        Price: "$8,995",
        Mileage: "88000",
        Photos: "https://x.com/1.jpg|https://x.com/2.jpg",
      },
      DEFAULT_FIELD_MAPPING,
    );
    expect(mapped.vin).toBe("1HGCM82633A004352");
    expect(mapped.make).toBe("Honda");
    expect(mapped.photoUrls).toEqual(["https://x.com/1.jpg", "https://x.com/2.jpg"]);
  });

  it("is case-insensitive on column names", () => {
    const mapped = applyFieldMapping(
      { vin: "X", make: "Ford", model: "Escape" },
      DEFAULT_FIELD_MAPPING,
    );
    expect(mapped.vin).toBe("X");
    expect(mapped.make).toBe("Ford");
  });

  it("supports dot-paths and array photos for JSON feeds", () => {
    const mapped = applyFieldMapping(
      {
        identifiers: { vin: "1HGCM82633A004352" },
        Make: "Honda",
        Model: "Accord",
        media: ["https://x.com/a.jpg", 42],
      },
      { ...DEFAULT_FIELD_MAPPING, vin: "identifiers.vin", photoUrls: "media" },
    );
    expect(mapped.vin).toBe("1HGCM82633A004352");
    expect(mapped.photoUrls).toEqual(["https://x.com/a.jpg"]);
  });
});
