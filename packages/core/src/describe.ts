/**
 * Marketplace description generation.
 *
 * Two paths behind one interface:
 *  1. AI provider (OpenAI-compatible chat completions) when configured.
 *  2. Deterministic compliant template engine (always available, used as
 *     fallback on any AI failure so the feature never hard-fails).
 *
 * Compliance: output is passed through a banned-phrase scrubber (no
 * guarantees/warranty promises unless dealer-configured, no "certified" claims
 * for non-CPO cars) and org disclaimers are always appended.
 */

export interface DescribableVehicle {
  year?: number | null;
  make: string;
  model: string;
  trim?: string | null;
  bodyStyle?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  engine?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  mileage?: number | null;
  priceCents?: number | null;
  condition: string;
}

export interface DescribeOptions {
  dealershipName?: string;
  phone?: string | null;
  disclaimers?: string[];
  tone?: "professional" | "friendly" | "energetic";
}

export interface DescriptionResult {
  text: string;
  source: "ai" | "template";
}

const BANNED_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(guaranteed?|guarantee)\b/gi, replacement: "expected" },
  {
    pattern: /\b(best price anywhere|lowest price guaranteed)\b/gi,
    replacement: "competitive pricing",
  },
  { pattern: /\bno accidents?\b/gi, replacement: "ask us for the vehicle history report" },
  { pattern: /\blifetime warranty\b/gi, replacement: "available service options" },
];

export function scrubBannedPhrases(text: string, condition: string): string {
  let out = text;
  for (const { pattern, replacement } of BANNED_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  if (condition !== "CERTIFIED_PRE_OWNED" && condition !== "NEW") {
    out = out.replace(/\bcertified\b/gi, "quality");
  }
  return out;
}

export function formatPrice(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function formatMileage(miles: number | null | undefined): string | null {
  if (miles == null) return null;
  return `${miles.toLocaleString("en-US")} miles`;
}

export function vehicleTitle(v: DescribableVehicle): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}

const TONE_OPENERS: Record<NonNullable<DescribeOptions["tone"]>, (title: string) => string> = {
  professional: (title) => `Now available: this well-maintained ${title}.`,
  friendly: (title) => `Come take a look at this ${title} — it's ready for its next owner!`,
  energetic: (title) => `Just landed! This ${title} won't sit on the lot for long.`,
};

/** Deterministic, compliant template description. */
export function generateTemplateDescription(
  v: DescribableVehicle,
  opts: DescribeOptions = {},
): DescriptionResult {
  const tone = opts.tone ?? "professional";
  const title = vehicleTitle(v);
  const lines: string[] = [];

  lines.push(TONE_OPENERS[tone](title));
  lines.push("");

  const specs: string[] = [];
  const mileage = formatMileage(v.mileage);
  if (mileage) specs.push(`• Mileage: ${mileage}`);
  if (v.engine) specs.push(`• Engine: ${v.engine}`);
  if (v.transmission) specs.push(`• Transmission: ${v.transmission}`);
  if (v.drivetrain) specs.push(`• Drivetrain: ${v.drivetrain}`);
  if (v.fuelType) specs.push(`• Fuel: ${v.fuelType}`);
  if (v.exteriorColor) specs.push(`• Exterior: ${v.exteriorColor}`);
  if (v.interiorColor) specs.push(`• Interior: ${v.interiorColor}`);
  if (specs.length > 0) {
    lines.push("Highlights:");
    lines.push(...specs);
    lines.push("");
  }

  const price = formatPrice(v.priceCents);
  if (price) lines.push(`Priced at ${price}.`);

  const conditionLine =
    v.condition === "NEW"
      ? "Brand new and ready to drive home."
      : v.condition === "CERTIFIED_PRE_OWNED"
        ? "Certified pre-owned — inspected and reconditioned."
        : "Pre-owned and lot-ready. Ask us for the full vehicle history report.";
  lines.push(conditionLine);
  lines.push("");

  const dealer = opts.dealershipName ?? "our dealership";
  const contact = opts.phone ? ` or call ${opts.phone}` : "";
  lines.push(
    `Message us on Marketplace${contact} to schedule a test drive at ${dealer}. Financing and trade-ins welcome.`,
  );

  for (const disclaimer of opts.disclaimers ?? []) {
    lines.push("");
    lines.push(disclaimer);
  }

  return { text: scrubBannedPhrases(lines.join("\n"), v.condition), source: "template" };
}

export interface AiProviderConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** OpenAI-compatible chat-completions call; falls back to the template on any failure. */
export async function generateDescription(
  v: DescribableVehicle,
  opts: DescribeOptions = {},
  ai?: AiProviderConfig,
): Promise<DescriptionResult> {
  if (!ai?.apiKey) return generateTemplateDescription(v, opts);

  const fetchImpl = ai.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ai.timeoutMs ?? 20_000);
  try {
    const res = await fetchImpl(`${ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        temperature: 0.7,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You write Facebook Marketplace vehicle listing descriptions for a car dealership. " +
              "Rules: be factual, use only the data provided, never invent features or history, " +
              "never promise warranties or guarantees, never claim 'no accidents', keep it under " +
              "180 words, use short paragraphs and a bulleted highlights section, end with a " +
              "call to action to message the dealership.",
          },
          {
            role: "user",
            content: JSON.stringify({
              vehicle: v,
              dealership: opts.dealershipName,
              phone: opts.phone,
              tone: opts.tone ?? "professional",
            }),
          },
        ],
      }),
    });
    if (!res.ok) return generateTemplateDescription(v, opts);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return generateTemplateDescription(v, opts);
    const withDisclaimers = [content, ...(opts.disclaimers ?? [])].join("\n\n");
    return { text: scrubBannedPhrases(withDisclaimers, v.condition), source: "ai" };
  } catch {
    return generateTemplateDescription(v, opts);
  } finally {
    clearTimeout(timer);
  }
}
