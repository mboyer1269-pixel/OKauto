import { z } from "zod";

import { env } from "@/lib/env";
import { ApiError } from "@/lib/http";

const vinWeights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const transliteration: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

export function normalizeVin(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.toUpperCase().replaceAll(/[\s-]/g, "");
}

export function isValidVin(value: string): boolean {
  const vin = normalizeVin(value);
  if (!vin || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
  const total = [...vin].reduce((sum, character, index) => {
    const digit = /\d/.test(character) ? Number(character) : transliteration[character];
    return sum + (digit ?? 0) * vinWeights[index]!;
  }, 0);
  const expected = total % 11 === 10 ? "X" : String(total % 11);
  return vin[8] === expected;
}

const httpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Photo URLs must use HTTPS.");

export const vehicleInput = z
  .object({
    vin: z.string().trim().optional().nullable(),
    stockNumber: z.string().trim().min(1).max(80).optional().nullable(),
    year: z.coerce.number().int().min(1886).max(new Date().getUTCFullYear() + 2),
    make: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(100),
    trim: z.string().trim().max(100).optional().nullable(),
    mileage: z.coerce.number().int().min(0).max(5_000_000).optional().nullable(),
    priceCents: z.coerce.number().int().min(0).max(1_000_000_000),
    status: z.enum(["AVAILABLE", "STALE", "SOLD", "ARCHIVED"]).default("AVAILABLE"),
    exteriorColor: z.string().trim().max(80).optional().nullable(),
    transmission: z.string().trim().max(80).optional().nullable(),
    fuelType: z.string().trim().max(80).optional().nullable(),
    bodyStyle: z.string().trim().max(80).optional().nullable(),
    photos: z.array(httpsUrl).max(50).default([]),
    facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  })
  .superRefine((vehicle, context) => {
    const vin = normalizeVin(vehicle.vin);
    if (!vin && !vehicle.stockNumber) {
      context.addIssue({ code: "custom", message: "VIN or stock number is required.", path: ["vin"] });
    }
    if (vin && !isValidVin(vin)) {
      context.addIssue({ code: "custom", message: "VIN check digit is invalid.", path: ["vin"] });
    }
  })
  .transform((vehicle) => ({ ...vehicle, vin: normalizeVin(vehicle.vin) }));

export type VehicleInput = z.infer<typeof vehicleInput>;

export function listingTitle(vehicle: Pick<VehicleInput, "year" | "make" | "model" | "trim">): string {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ").slice(0, 100);
}

export function groundedDescription(vehicle: VehicleInput, dealershipName: string): string {
  const highlights = [
    vehicle.mileage !== null && vehicle.mileage !== undefined ? `${vehicle.mileage.toLocaleString("en-US")} miles` : null,
    vehicle.exteriorColor ? `${vehicle.exteriorColor} exterior` : null,
    vehicle.transmission,
    vehicle.fuelType,
    vehicle.bodyStyle,
  ].filter(Boolean);
  const stock = vehicle.stockNumber ? ` Stock #${vehicle.stockNumber}.` : "";
  return [
    `${listingTitle(vehicle)} available now at ${dealershipName}.`,
    highlights.length ? `Highlights: ${highlights.join(" • ")}.` : "",
    `Price: $${(vehicle.priceCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}.${stock}`,
    "Message us to confirm availability and arrange a test drive. Vehicle details and availability are subject to verification.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateDescription(vehicle: VehicleInput, dealershipName: string): Promise<{ text: string; provider: "local" | "external" }> {
  const fallback = groundedDescription(vehicle, dealershipName);
  const config = env();
  if (!config.AI_BASE_URL || !config.AI_API_KEY || !config.AI_MODEL) return { text: fallback, provider: "local" };

  const facts = {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    mileage: vehicle.mileage,
    price: vehicle.priceCents / 100,
    exteriorColor: vehicle.exteriorColor,
    transmission: vehicle.transmission,
    fuelType: vehicle.fuelType,
    bodyStyle: vehicle.bodyStyle,
    stockNumber: vehicle.stockNumber,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(new URL("/v1/chat/completions", config.AI_BASE_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${config.AI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: config.AI_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Write a concise vehicle marketplace description using only supplied facts. Never invent condition, warranty, financing, accident history, features, or availability. Include a verification disclaimer. Return plain text.",
          },
          { role: "user", content: JSON.stringify({ dealershipName, facts }) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new ApiError(502, "AI_PROVIDER_ERROR", "The description provider is unavailable.");
    const result = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = result.choices?.[0]?.message?.content?.trim();
    return text ? { text: text.slice(0, 5000), provider: "external" } : { text: fallback, provider: "local" };
  } catch {
    return { text: fallback, provider: "local" };
  } finally {
    clearTimeout(timeout);
  }
}
