import type { DescribableVehicle, DescriptionTone } from "@openlot/shared";
import { buildSpecLines, generateDescription, vehicleTitle } from "@openlot/shared";
import type { AppConfig } from "../config.js";

export interface DescriptionResult {
  text: string;
  /** AI = LLM-generated, TEMPLATE = deterministic fallback. */
  source: "AI" | "TEMPLATE";
}

export interface GenerateOptions {
  tone: DescriptionTone;
  includeDisclaimer: boolean;
  maxLength: number;
}

export interface AiService {
  enabled: boolean;
  generateVehicleDescription(vehicle: DescribableVehicle, opts: GenerateOptions): Promise<DescriptionResult>;
}

type FetchLike = typeof fetch;

function buildPrompt(vehicle: DescribableVehicle, opts: GenerateOptions): string {
  const facts = [
    `Title: ${vehicleTitle(vehicle)}`,
    ...buildSpecLines(vehicle),
    vehicle.features?.length ? `Features: ${vehicle.features.join(", ")}` : "",
    vehicle.dealershipName ? `Dealership: ${vehicle.dealershipName}` : "",
    vehicle.dealershipCity ? `City: ${vehicle.dealershipCity}` : "",
    vehicle.dealershipPhone ? `Phone: ${vehicle.dealershipPhone}` : "",
  ].filter(Boolean);
  return [
    "Write a Facebook Marketplace vehicle listing description for a dealership.",
    `Tone: ${opts.tone.toLowerCase()}.`,
    `Maximum length: ${opts.maxLength} characters.`,
    "Rules:",
    "- Use ONLY the facts below. Never invent specs, history, warranties or condition claims.",
    "- No ALL-CAPS spam, no excessive emojis, no misleading urgency.",
    "- Structure: short opening, bulleted highlights, call to action to message on Marketplace.",
    opts.includeDisclaimer
      ? "- End with a one-sentence pricing/availability disclaimer (tax, title, license, dealer fees excluded)."
      : "- Do not include a legal disclaimer.",
    "",
    "Facts:",
    ...facts,
  ].join("\n");
}

export function createAiService(
  config: Pick<AppConfig, "OPENAI_API_KEY" | "OPENAI_BASE_URL" | "OPENAI_MODEL">,
  fetchImpl: FetchLike = fetch,
  logger: { warn: (obj: unknown, msg?: string) => void } = console as never,
): AiService {
  const enabled = Boolean(config.OPENAI_API_KEY);

  async function callOpenAi(vehicle: DescribableVehicle, opts: GenerateOptions): Promise<string> {
    const response = await fetchImpl(`${config.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.OPENAI_MODEL,
        temperature: 0.7,
        max_tokens: 900,
        messages: [
          { role: "system", content: "You are a copywriter for auto dealerships. You only state provided facts." },
          { role: "user", content: buildPrompt(vehicle, opts) },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`AI provider returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("AI provider returned an empty completion");
    return text.length > opts.maxLength ? `${text.slice(0, opts.maxLength - 1).trimEnd()}…` : text;
  }

  return {
    enabled,
    async generateVehicleDescription(vehicle, opts) {
      if (enabled) {
        try {
          return { text: await callOpenAi(vehicle, opts), source: "AI" };
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, "AI generation failed; using template fallback");
        }
      }
      return {
        text: generateDescription(vehicle, {
          tone: opts.tone,
          includeDisclaimer: opts.includeDisclaimer,
          maxLength: opts.maxLength,
        }),
        source: "TEMPLATE",
      };
    },
  };
}
