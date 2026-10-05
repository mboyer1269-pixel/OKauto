export const TODAY_SCORE = {
  ageMaxPoints: 40,
  ageCapDays: 90,
  managerPriority: 25,
  recentPriceDrop: 15,
  priceDropWindowDays: 7,
  noTeamListing: 10,
  alreadyListedByOther: -30,
  enoughPhotos: 5,
  enoughPhotoCount: 8,
  fewPhotos: -10,
} as const;

export const PRICE_REQUIRED_REASON = "Prix de vente requis.";

export interface TodayScoreInput {
  createdAt: Date | string;
  price?: number | null;
  priceDroppedAt?: Date | string | null;
  managerPriority?: boolean;
  managerPriorityNote?: string | null;
  photoCount?: number;
  activeListingsByOthers?: number;
  alreadyListedByNames?: string[];
  blockers?: string[];
  now?: Date;
}

export interface TodayScoreResult {
  score: number;
  reasons: string[];
  excludedReason?: string;
}

function daysBetween(from: Date | string, to: Date): number {
  const start = from instanceof Date ? from : new Date(from);
  return Math.max(0, Math.floor((to.getTime() - start.getTime()) / 86_400_000));
}

export function scoreVehicleForToday(input: TodayScoreInput): TodayScoreResult {
  const now = input.now ?? new Date();
  const blockers = input.blockers ?? [];
  const reasons: string[] = [];

  if (input.price == null || input.price <= 0) {
    blockers.unshift(PRICE_REQUIRED_REASON);
  }

  if (blockers.length > 0) {
    return { score: 0, reasons, excludedReason: blockers[0] };
  }

  const daysInStock = daysBetween(input.createdAt, now);
  const ageScore =
    (Math.min(daysInStock, TODAY_SCORE.ageCapDays) / TODAY_SCORE.ageCapDays) *
    TODAY_SCORE.ageMaxPoints;
  let score = ageScore;
  reasons.push(`En stock depuis ${daysInStock} jour${daysInStock > 1 ? "s" : ""}`);

  if (input.managerPriority) {
    score += TODAY_SCORE.managerPriority;
    reasons.push(
      input.managerPriorityNote
        ? `Priorité du directeur — ${input.managerPriorityNote}`
        : "Priorité du directeur",
    );
  }

  if (input.priceDroppedAt) {
    const dropDays = daysBetween(input.priceDroppedAt, now);
    if (dropDays <= TODAY_SCORE.priceDropWindowDays) {
      score += TODAY_SCORE.recentPriceDrop;
      reasons.push(
        dropDays === 0
          ? "Prix réduit aujourd’hui"
          : `Prix réduit il y a ${dropDays} jour${dropDays > 1 ? "s" : ""}`,
      );
    }
  }

  const listedByOthers = input.activeListingsByOthers ?? 0;
  if (listedByOthers > 0) {
    score += TODAY_SCORE.alreadyListedByOther;
    const names = input.alreadyListedByNames?.filter(Boolean) ?? [];
    reasons.push(
      names.length
        ? `Déjà publié par ${names.join(", ")}`
        : "Déjà en ligne chez un collègue",
    );
  } else {
    score += TODAY_SCORE.noTeamListing;
    reasons.push("Personne de l’équipe ne l’a publié");
  }

  const photos = input.photoCount ?? 0;
  if (photos >= TODAY_SCORE.enoughPhotoCount) {
    score += TODAY_SCORE.enoughPhotos;
    reasons.push("8 photos ou plus");
  } else if (photos < 2) {
    score += TODAY_SCORE.fewPhotos;
    reasons.push("Photos insuffisantes");
  }

  return { score, reasons };
}
