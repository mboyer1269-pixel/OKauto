import { createHash } from "node:crypto";
import { formatVehicleTitle } from "@okauto/shared";

export type DescribeVehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  priceCents: number;
  mileage?: number | null;
  bodyStyle?: string | null;
  exteriorColor?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  description?: string | null;
};

export type DescribeOptions = {
  tone?: "professional" | "friendly" | "urgent";
  includePrice?: boolean;
  maxLength?: number;
};

const BANNED = [
  /\bguaranteed\b/i,
  /\bfinance approved\b/i,
  /\bno credit\b/i,
  /\bclickbait\b/i,
];

export function promptHash(vehicleId: string, opts: DescribeOptions): string {
  return createHash("sha256")
    .update(JSON.stringify({ vehicleId, opts }))
    .digest("hex")
    .slice(0, 32);
}

export function templateDescription(
  vehicle: DescribeVehicle,
  opts: DescribeOptions = {},
): string {
  const title = formatVehicleTitle(vehicle);
  const miles =
    vehicle.mileage != null
      ? `${vehicle.mileage.toLocaleString()} miles`
      : "mileage available on request";
  const price =
    opts.includePrice !== false
      ? `Asking $${(vehicle.priceCents / 100).toLocaleString()}`
      : null;

  const highlights = [
    vehicle.trim ? `Trim: ${vehicle.trim}` : null,
    vehicle.bodyStyle ? `Body: ${vehicle.bodyStyle}` : null,
    vehicle.exteriorColor ? `Exterior: ${vehicle.exteriorColor}` : null,
    vehicle.drivetrain ? `Drivetrain: ${vehicle.drivetrain}` : null,
    vehicle.transmission ? `Transmission: ${vehicle.transmission}` : null,
    vehicle.fuelType ? `Fuel: ${vehicle.fuelType}` : null,
  ].filter(Boolean);

  const toneLead =
    opts.tone === "friendly"
      ? `Ready for a great ${vehicle.make}?`
      : opts.tone === "urgent"
        ? `Just arrived — don't wait on this ${vehicle.make} ${vehicle.model}.`
        : `Well-maintained ${title} available now.`;

  const body = [
    toneLead,
    "",
    `${title} with ${miles}.`,
    highlights.length ? highlights.join(" · ") : null,
    vehicle.description ? vehicle.description.trim() : null,
    "",
    price,
    "Clean title. Schedule a visit or message for details, financing options, and trade-in evaluation.",
    "Dealer listing — serious inquiries welcome.",
  ]
    .filter((line) => line != null && line !== "")
    .join("\n");

  return sanitizeDescription(body, opts.maxLength ?? 1200);
}

export function sanitizeDescription(text: string, maxLength = 1200): string {
  let out = text.replace(/\s+\n/g, "\n").trim();
  for (const re of BANNED) {
    out = out.replace(re, "").replace(/\s{2,}/g, " ");
  }
  if (out.length > maxLength) {
    out = `${out.slice(0, maxLength - 1).trim()}…`;
  }
  return out;
}

export async function generateDescription(
  vehicle: DescribeVehicle,
  opts: DescribeOptions = {},
): Promise<{ body: string; provider: string }> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return { body: templateDescription(vehicle, opts), provider: "template" };
  }

  const baseUrl = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  const title = formatVehicleTitle(vehicle);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        messages: [
          {
            role: "system",
            content:
              "You write compliant Facebook Marketplace vehicle descriptions for dealerships. No guarantees, no credit claims, no emojis spam. Keep factual and scannable.",
          },
          {
            role: "user",
            content: `Write a ${opts.tone ?? "professional"} Marketplace description for ${title}. Price cents: ${vehicle.priceCents}. Mileage: ${vehicle.mileage ?? "n/a"}. Specs: ${JSON.stringify(
              {
                trim: vehicle.trim,
                bodyStyle: vehicle.bodyStyle,
                exteriorColor: vehicle.exteriorColor,
                drivetrain: vehicle.drivetrain,
                transmission: vehicle.transmission,
                fuelType: vehicle.fuelType,
              },
            )}. Max ${opts.maxLength ?? 1200} characters. Include price: ${opts.includePrice !== false}.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return { body: templateDescription(vehicle, opts), provider: "template-fallback" };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { body: templateDescription(vehicle, opts), provider: "template-fallback" };
    }
    return {
      body: sanitizeDescription(content, opts.maxLength ?? 1200),
      provider: "ai",
    };
  } catch {
    return { body: templateDescription(vehicle, opts), provider: "template-fallback" };
  }
}
