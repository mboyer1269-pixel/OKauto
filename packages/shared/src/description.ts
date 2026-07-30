import type { BodyStyle, Drivetrain, FuelType, Transmission, VehicleCondition } from "./schemas.js";

/**
 * Deterministic, compliance-friendly listing description generator.
 *
 * Used as the offline/AI-fallback provider and for instant previews in the
 * extension. Never fabricates specs: only facts present on the vehicle are
 * rendered. The AI provider (when configured) receives the same fact sheet.
 */

export interface DescribableVehicle {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  bodyStyle?: BodyStyle | null;
  condition?: VehicleCondition | null;
  mileage?: number | null;
  priceCents?: number | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  transmission?: Transmission | null;
  fuelType?: FuelType | null;
  drivetrain?: Drivetrain | null;
  engine?: string | null;
  doors?: number | null;
  features?: string[] | null;
  dealershipName?: string | null;
  dealershipPhone?: string | null;
  dealershipCity?: string | null;
}

export type DescriptionTone = "PROFESSIONAL" | "FRIENDLY" | "ENTHUSIASTIC";

const LABELS: Record<string, Record<string, string>> = {
  transmission: {
    AUTOMATIC: "Automatic transmission",
    MANUAL: "Manual transmission",
    CVT: "CVT transmission",
    OTHER: "",
  },
  fuelType: {
    GASOLINE: "Gasoline",
    DIESEL: "Diesel",
    HYBRID: "Hybrid",
    PLUGIN_HYBRID: "Plug-in hybrid",
    ELECTRIC: "Electric",
    FLEX: "Flex fuel",
    OTHER: "",
  },
  drivetrain: {
    FWD: "Front-wheel drive",
    RWD: "Rear-wheel drive",
    AWD: "All-wheel drive",
    FOUR_WD: "4WD",
    OTHER: "",
  },
};

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function formatMileage(miles: number): string {
  return `${miles.toLocaleString("en-US")} miles`;
}

export function vehicleTitle(v: DescribableVehicle): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}

function openingLine(v: DescribableVehicle, tone: DescriptionTone): string {
  const title = vehicleTitle(v);
  const condition =
    v.condition === "CERTIFIED" ? "certified pre-owned" : v.condition === "NEW" ? "new" : "well-maintained";
  switch (tone) {
    case "FRIENDLY":
      return `Take a look at this ${condition} ${title} — a great fit for your next ride.`;
    case "ENTHUSIASTIC":
      return `Just arrived: a ${condition} ${title} that is ready to impress!`;
    case "PROFESSIONAL":
    default:
      return `Now available: ${condition} ${title}.`;
  }
}

export function buildSpecLines(v: DescribableVehicle): string[] {
  const lines: string[] = [];
  if (v.mileage !== null && v.mileage !== undefined) lines.push(`Mileage: ${formatMileage(v.mileage)}`);
  if (v.exteriorColor) lines.push(`Exterior: ${v.exteriorColor}`);
  if (v.interiorColor) lines.push(`Interior: ${v.interiorColor}`);
  if (v.engine) lines.push(`Engine: ${v.engine}`);
  const trans = v.transmission ? LABELS.transmission![v.transmission] : "";
  if (trans) lines.push(trans);
  const drive = v.drivetrain ? LABELS.drivetrain![v.drivetrain] : "";
  if (drive) lines.push(drive);
  const fuel = v.fuelType ? LABELS.fuelType![v.fuelType] : "";
  if (fuel) lines.push(`Fuel: ${fuel}`);
  if (v.doors) lines.push(`${v.doors} doors`);
  return lines;
}

export function generateDescription(
  v: DescribableVehicle,
  opts: { tone?: DescriptionTone; includeDisclaimer?: boolean; maxLength?: number } = {},
): string {
  const tone = opts.tone ?? "PROFESSIONAL";
  const includeDisclaimer = opts.includeDisclaimer ?? true;
  const maxLength = opts.maxLength ?? 2500;

  const sections: string[] = [openingLine(v, tone)];

  const specs = buildSpecLines(v);
  if (specs.length > 0) {
    sections.push(["Highlights:", ...specs.map((s) => `• ${s}`)].join("\n"));
  }

  const features = (v.features ?? []).filter(Boolean).slice(0, 12);
  if (features.length > 0) {
    sections.push(["Equipment & features:", ...features.map((f) => `• ${f}`)].join("\n"));
  }

  if (v.priceCents !== null && v.priceCents !== undefined && v.priceCents > 0) {
    sections.push(`Priced at ${formatUsd(v.priceCents)}.`);
  }

  const dealerBits: string[] = [];
  if (v.dealershipName) dealerBits.push(`Offered by ${v.dealershipName}${v.dealershipCity ? ` in ${v.dealershipCity}` : ""}.`);
  dealerBits.push("Message us through Marketplace to schedule a test drive or ask a question — quick replies during business hours.");
  if (v.dealershipPhone) dealerBits.push(`Prefer to call? Reach us at ${v.dealershipPhone}.`);
  sections.push(dealerBits.join(" "));

  if (includeDisclaimer) {
    sections.push(
      "Price excludes tax, title, license and dealer fees. Vehicle availability and pricing are subject to change; please confirm details with the dealership.",
    );
  }

  let text = sections.join("\n\n");
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength - 1).trimEnd()}…`;
  }
  return text;
}
