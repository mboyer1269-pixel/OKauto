/**
 * Compliance-aware listing description engine.
 * Deterministic template renderer + banned-phrase scrubber. The AI provider in
 * apps/api builds on these primitives so every output path is scrubbed.
 */

export const DEFAULT_COMPLIANCE_FOOTER =
  "Vehicle offered by a licensed dealer. Prices exclude taxes, title, registration and dealer fees. " +
  "Specs and availability subject to change; contact the dealer to confirm.";

/**
 * Phrases we never allow in generated copy: misleading urgency claims, discriminatory
 * or steering language, and unverifiable superlatives. Scrubbed case-insensitively.
 */
export const BANNED_PHRASES: readonly string[] = [
  "won't last",
  "wont last",
  "act now",
  "guaranteed approval",
  "guaranteed financing",
  "no credit check",
  "everyone approved",
  "best deal in town",
  "lowest price guaranteed",
  "one owner guaranteed",
  "accident free guaranteed",
  "perfect condition",
  "like new condition guaranteed",
  "must sell today",
  "cash only no exceptions",
];

export const DEFAULT_TEMPLATE = `{{year}} {{make}} {{model}}{{#trim}} {{trim}}{{/trim}}

{{summaryLine}}

Key details:
{{specLines}}

{{dealerLine}}

{{footer}}`;

export interface DescriptionVehicle {
  year: number | null;
  make: string;
  model: string;
  trim?: string | null;
  mileage?: number | null;
  bodyStyle?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  condition?: string | null;
  vin?: string | null;
  stockNumber?: string | null;
}

export interface RenderContext {
  vehicle: DescriptionVehicle;
  template?: string | null;
  dealerName?: string | null;
  dealerContact?: string | null;
  footer?: string | null;
  /** Extra spec rows, e.g. ["Tow package", "Sunroof"] */
  highlights?: string[];
}

function humanizeEnum(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bCvt\b/, "CVT")
    .replace(/\bFwd\b/, "FWD")
    .replace(/\bRwd\b/, "RWD")
    .replace(/\bAwd\b/, "AWD");
}

export function buildSpecLines(vehicle: DescriptionVehicle, highlights: string[] = []): string[] {
  const lines: string[] = [];
  if (vehicle.mileage != null) lines.push(`- Mileage: ${vehicle.mileage.toLocaleString("en-US")} mi`);
  if (vehicle.bodyStyle) lines.push(`- Body style: ${humanizeEnum(vehicle.bodyStyle)}`);
  if (vehicle.fuelType) lines.push(`- Fuel: ${humanizeEnum(vehicle.fuelType)}`);
  if (vehicle.transmission) lines.push(`- Transmission: ${humanizeEnum(vehicle.transmission)}`);
  if (vehicle.drivetrain) lines.push(`- Drivetrain: ${humanizeEnum(vehicle.drivetrain)}`);
  if (vehicle.exteriorColor) lines.push(`- Exterior color: ${vehicle.exteriorColor}`);
  if (vehicle.interiorColor) lines.push(`- Interior color: ${vehicle.interiorColor}`);
  if (vehicle.condition) lines.push(`- Condition: ${humanizeEnum(vehicle.condition)}`);
  if (vehicle.stockNumber) lines.push(`- Stock #: ${vehicle.stockNumber}`);
  if (vehicle.vin) lines.push(`- VIN: ${vehicle.vin}`);
  for (const h of highlights) lines.push(`- ${h}`);
  return lines;
}

export function buildSummaryLine(vehicle: DescriptionVehicle): string {
  const parts: string[] = [];
  if (vehicle.condition) parts.push(humanizeEnum(vehicle.condition));
  parts.push(`${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}`.trim());
  if (vehicle.mileage != null) parts.push(`with ${vehicle.mileage.toLocaleString("en-US")} miles`);
  return `Well-maintained ${parts.join(" ")}. Contact us today to schedule a test drive or request more photos.`;
}

/** Minimal mustache-lite: {{var}} interpolation and {{#var}}...{{/var}} conditional sections. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (let round = 0; round < 8; round += 1) {
    const next = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, body: string) =>
      vars[key] ? body : "",
    );
    if (next === out) break;
    out = next;
  }
  // also strip unmatched closing tags produced by simple var collisions
  out = out.replace(/\{\{\/(\w+)\}\}/g, "");
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? "");
  return out;
}

export function scrubBannedPhrases(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  let out = text;
  for (const phrase of BANNED_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(out)) {
      removed.push(phrase);
      out = out.replace(re, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
    }
  }
  return { text: out.trim(), removed };
}

export function renderDescription(ctx: RenderContext): { text: string; removedPhrases: string[] } {
  const template = ctx.template ?? DEFAULT_TEMPLATE;
  const specLines = buildSpecLines(ctx.vehicle, ctx.highlights ?? []);
  const dealerLine = ctx.dealerName
    ? `Offered by ${ctx.dealerName}${ctx.dealerContact ? ` — ${ctx.dealerContact}` : ""}.`
    : ctx.dealerContact ?? "";
  const rendered = renderTemplate(template, {
    year: ctx.vehicle.year != null ? String(ctx.vehicle.year) : "",
    make: ctx.vehicle.make,
    model: ctx.vehicle.model,
    trim: ctx.vehicle.trim ?? "",
    summaryLine: buildSummaryLine(ctx.vehicle),
    specLines: specLines.join("\n"),
    dealerLine,
    footer: ctx.footer ?? DEFAULT_COMPLIANCE_FOOTER,
  });
  const scrubbed = scrubBannedPhrases(rendered);
  return { text: normalizeWhitespace(scrubbed.text), removedPhrases: scrubbed.removed };
}

function normalizeWhitespace(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Marketplace-style listing title, bounded length. */
export function buildListingTitle(vehicle: DescriptionVehicle, maxLen = 99): string {
  const base = `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}`.trim();
  return base.length > maxLen ? base.slice(0, maxLen - 1).trimEnd() + "…" : base;
}
