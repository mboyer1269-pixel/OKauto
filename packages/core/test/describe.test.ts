import { describe, expect, it } from "vitest";
import {
  generateDescription,
  generateTemplateDescription,
  scrubBannedPhrases,
  vehicleTitle,
} from "../src/describe.js";

const vehicle = {
  year: 2021,
  make: "Toyota",
  model: "RAV4",
  trim: "XLE",
  mileage: 32_500,
  priceCents: 2_749_900,
  condition: "USED",
  transmission: "8-Speed Automatic",
  exteriorColor: "Silver",
};

describe("generateTemplateDescription", () => {
  it("includes title, specs, price, and CTA", () => {
    const { text, source } = generateTemplateDescription(vehicle, {
      dealershipName: "Sunrise Motors",
      phone: "(555) 010-2000",
    });
    expect(source).toBe("template");
    expect(text).toContain("2021 Toyota RAV4 XLE");
    expect(text).toContain("32,500 miles");
    expect(text).toContain("$27,499");
    expect(text).toContain("Sunrise Motors");
    expect(text).toContain("(555) 010-2000");
  });

  it("appends org disclaimers", () => {
    const { text } = generateTemplateDescription(vehicle, {
      disclaimers: ["Price excludes tax, title, and $299 doc fee."],
    });
    expect(text).toContain("$299 doc fee");
  });

  it("never claims 'certified' for plain used vehicles", () => {
    const { text } = generateTemplateDescription(vehicle);
    expect(/certified/i.test(text)).toBe(false);
  });

  it("is deterministic", () => {
    const a = generateTemplateDescription(vehicle).text;
    const b = generateTemplateDescription(vehicle).text;
    expect(a).toBe(b);
  });
});

describe("scrubBannedPhrases", () => {
  it("removes risky compliance phrases", () => {
    const scrubbed = scrubBannedPhrases(
      "Guaranteed lowest price! No accidents. Certified quality with lifetime warranty.",
      "USED",
    );
    expect(/guaranteed/i.test(scrubbed)).toBe(false);
    expect(/no accidents/i.test(scrubbed)).toBe(false);
    expect(/lifetime warranty/i.test(scrubbed)).toBe(false);
    expect(/certified/i.test(scrubbed)).toBe(false);
  });

  it("keeps 'certified' for CPO vehicles", () => {
    expect(scrubBannedPhrases("Certified pre-owned.", "CERTIFIED_PRE_OWNED")).toContain(
      "Certified",
    );
  });
});

describe("generateDescription (AI path)", () => {
  it("uses AI output and appends disclaimers", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "A lovely RAV4 ready to go." } }] }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const result = await generateDescription(
      vehicle,
      { disclaimers: ["Plus fees."] },
      { apiKey: "k", model: "m", baseUrl: "https://ai.example.com/v1", fetchImpl },
    );
    expect(result.source).toBe("ai");
    expect(result.text).toContain("A lovely RAV4");
    expect(result.text).toContain("Plus fees.");
  });

  it("falls back to template on provider failure", async () => {
    const fetchImpl = (async () =>
      new Response("oops", { status: 500 })) as unknown as typeof fetch;
    const result = await generateDescription(
      vehicle,
      {},
      {
        apiKey: "k",
        model: "m",
        baseUrl: "https://ai.example.com/v1",
        fetchImpl,
      },
    );
    expect(result.source).toBe("template");
  });

  it("scrubs banned phrases from AI output", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "Guaranteed no accidents!" } }] }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const result = await generateDescription(
      vehicle,
      {},
      {
        apiKey: "k",
        model: "m",
        baseUrl: "https://ai.example.com/v1",
        fetchImpl,
      },
    );
    expect(/guaranteed/i.test(result.text)).toBe(false);
  });
});

describe("vehicleTitle", () => {
  it("joins present parts", () => {
    expect(vehicleTitle(vehicle)).toBe("2021 Toyota RAV4 XLE");
    expect(vehicleTitle({ make: "Ford", model: "F-150", condition: "USED" })).toBe("Ford F-150");
  });
});
