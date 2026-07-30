import {
  buildTemplateDescription,
  vehicleTitle,
  type DescribeVehicleSchema,
} from "@okauto/shared";
import type { z } from "zod";
import type { Env } from "../lib/env.js";

type VehicleLike = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  mileage?: number | null;
  priceCents: number;
  exteriorColor?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  drivetrain?: string | null;
  stockNumber?: string | null;
  vin?: string | null;
  bodyStyle?: string | null;
};

export async function generateVehicleDescription(
  env: Env,
  vehicle: VehicleLike,
  options: z.infer<typeof DescribeVehicleSchema>,
): Promise<{ description: string; provider: "openai" | "template" }> {
  const template = buildTemplateDescription(vehicle, {
    includeVin: options.includeVin,
    tone: options.tone,
  }).slice(0, options.maxLength);

  if (!env.OPENAI_API_KEY) {
    return { description: template, provider: "template" };
  }

  try {
    const prompt = [
      "Write a Facebook Marketplace-compliant vehicle listing description.",
      "Do not invent features. Do not include external links or prohibited claims.",
      `Tone: ${options.tone}. Max length: ${options.maxLength} characters.`,
      `Vehicle JSON: ${JSON.stringify({
        title: vehicleTitle(vehicle),
        ...vehicle,
        includeVin: options.includeVin,
      })}`,
    ].join("\n");

    const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are an automotive listing copywriter. Output plain text only.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return { description: template, provider: "template" };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { description: template, provider: "template" };
    return {
      description: text.slice(0, options.maxLength),
      provider: "openai",
    };
  } catch {
    return { description: template, provider: "template" };
  }
}
