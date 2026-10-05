export const DEFAULT_MONTHLY_LISTING_LIMIT = 5;
export const DEFAULT_LISTING_RENEWAL_DAYS = 7;
export const MARKETPLACE_TIME_ZONE = "America/Toronto";

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function zonedDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = Date.UTC(
    zonedParts(new Date(utcGuess), timeZone).year,
    zonedParts(new Date(utcGuess), timeZone).month - 1,
    zonedParts(new Date(utcGuess), timeZone).day,
    zonedParts(new Date(utcGuess), timeZone).hour,
    zonedParts(new Date(utcGuess), timeZone).minute,
    zonedParts(new Date(utcGuess), timeZone).second,
  ) - utcGuess;
  return new Date(utcGuess - offset);
}

export type PublishInventoryKind = "new" | "demo" | "used" | null;

export interface PublishCandidateInput {
  id: string;
  createdAt: Date | string;
  hasPhoto: boolean;
  hasPrice: boolean;
  hasMileage: boolean;
  kind: PublishInventoryKind;
}

export interface ScoredPublishCandidate extends PublishCandidateInput {
  daysInStock: number;
  score: number;
  reasons: string[];
}

export function startOfCalendarMonth(
  now: Date = new Date(),
  timeZone = MARKETPLACE_TIME_ZONE,
): Date {
  const { year, month } = zonedParts(now, timeZone);
  return zonedDateTime(year, month, 1, 0, 0, 0, timeZone);
}

export function startOfNextCalendarMonth(
  now: Date = new Date(),
  timeZone = MARKETPLACE_TIME_ZONE,
): Date {
  return startOfCalendarMonth(
    new Date(startOfCalendarMonth(now, timeZone).getTime() + 32 * 86_400_000),
    timeZone,
  );
}

export function daysBetween(from: Date | string, to: Date = new Date()): number {
  const start = from instanceof Date ? from : new Date(from);
  const ms = to.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function remainingListingSlots(
  usedThisMonth: number,
  monthlyLimit = DEFAULT_MONTHLY_LISTING_LIMIT,
): number {
  return Math.max(0, monthlyLimit - Math.max(0, usedThisMonth));
}

/** member override > org marketplace setting > org listing limit > default 5 */
export function resolveMonthlyListingLimit(input: {
  memberLimit?: number | null;
  organizationMarketplaceLimit?: number | null;
  organizationMonthlyLimit?: number | null;
}): number {
  return (
    input.memberLimit ??
    input.organizationMarketplaceLimit ??
    input.organizationMonthlyLimit ??
    DEFAULT_MONTHLY_LISTING_LIMIT
  );
}

export function isListingDueForRenewal(
  listedAt: Date | string,
  lastRenewedAt: Date | string | null | undefined,
  renewalDays = DEFAULT_LISTING_RENEWAL_DAYS,
  now: Date = new Date(),
): boolean {
  const reference = lastRenewedAt ?? listedAt;
  return daysBetween(reference, now) >= renewalDays;
}

export function scorePublishCandidate(
  vehicle: PublishCandidateInput,
  now: Date = new Date(),
): ScoredPublishCandidate {
  const daysInStock = daysBetween(vehicle.createdAt, now);
  const reasons: string[] = [];
  let score = daysInStock * 2;

  if (daysInStock >= 45) reasons.push("Plus de 45 jours en stock");
  else if (daysInStock >= 21) reasons.push("Plus de 21 jours en stock");
  else if (daysInStock >= 7) reasons.push("Une semaine ou plus en stock");
  else reasons.push("Arrivage récent");

  if (vehicle.kind === "used") {
    score += 18;
    reasons.push("Occasion : prioritaire sur Marketplace");
  } else if (vehicle.kind === "demo") {
    score += 10;
    reasons.push("Démonstrateur");
  }

  if (!vehicle.hasPhoto) {
    score -= 80;
    reasons.push("Photo manquante");
  }
  if (!vehicle.hasPrice) {
    score -= 80;
    reasons.push("Prix manquant");
  }
  if (vehicle.kind === "used" && !vehicle.hasMileage) {
    score -= 40;
    reasons.push("Kilométrage manquant");
  }

  return { ...vehicle, daysInStock, score, reasons };
}

export function rankPublishCandidates(
  vehicles: PublishCandidateInput[],
  limit: number,
  now: Date = new Date(),
): ScoredPublishCandidate[] {
  return vehicles
    .map((vehicle) => scorePublishCandidate(vehicle, now))
    .sort((a, b) => b.score - a.score || b.daysInStock - a.daysInStock)
    .filter((vehicle) => vehicle.score > -50)
    .slice(0, Math.max(0, limit));
}
