export type FillIssueReason =
  | "missing_field"
  | "missing_option"
  | "exception"
  | "partial";

export type FillIssue = {
  field: string;
  step: string;
  reason: FillIssueReason;
  message: string;
};

export type FillReport = {
  filled: string[];
  issues: FillIssue[];
};

const FIELD_LABELS_FR: Record<string, string> = {
  vehicleType: "Type de véhicule",
  year: "Année",
  make: "Marque",
  model: "Modèle",
  mileage: "Kilométrage",
  title: "Titre",
  price: "Prix",
  description: "Description",
  bodyStyle: "Style de carrosserie",
  exteriorColor: "Couleur extérieure",
  fuelType: "Type de carburant",
  transmission: "Transmission",
  photos: "Photos",
};

export function fieldLabelFr(field: string): string {
  return FIELD_LABELS_FR[field] ?? field;
}

export function missingFieldIssue(
  field: string,
  step = `find_${field}`,
): FillIssue {
  const label = fieldLabelFr(field);
  return {
    field,
    step,
    reason: "missing_field",
    message: `Champ « ${label} » introuvable dans le formulaire Facebook (étape ${step}).`,
  };
}

export function missingOptionIssue(
  field: string,
  option: string,
  step = `select_${field}`,
): FillIssue {
  const label = fieldLabelFr(field);
  return {
    field,
    step,
    reason: "missing_option",
    message: `L’option « ${option} » n’a pas pu être sélectionnée pour ${label} (étape ${step}).`,
  };
}

export function exceptionIssue(
  field: string,
  step: string,
  detail: string,
): FillIssue {
  const label = fieldLabelFr(field);
  return {
    field,
    step,
    reason: "exception",
    message: `L’étape « ${label} » a échoué (${step}) : ${detail}`,
  };
}

export function formatPreparationStatus(report: FillReport): string {
  const filledText =
    report.filled.length > 0
      ? `Champs préparés : ${report.filled.join(", ")}.`
      : "Aucun champ n’a pu être préparé.";
  if (report.issues.length === 0) return filledText;
  const missing = report.issues.map((issue) => issue.message).join(" ");
  return `${filledText} À compléter : ${missing}`;
}

export function formatFatalBanner(
  report: FillReport | undefined,
  fallback: string,
): string {
  if (!report?.issues.length) return fallback;
  const first = report.issues[0];
  return `Remplissage interrompu à l’étape « ${fieldLabelFr(first.field)} » (${first.step}). ${first.message}`;
}

export function toLegacyErrorLabels(report: FillReport): string[] {
  return report.issues.map((issue) => issue.message);
}

export function buildFillTelemetry(
  vehicleId: string,
  report: FillReport,
  pageUrl?: string,
) {
  const eventType = report.issues.length > 0 ? "listing_error" : "form_filled";
  return {
    eventType,
    vehicleId,
    metadata: {
      source: "extension",
      filled: report.filled,
      failedFields: report.issues.map((issue) => ({
        field: issue.field,
        step: issue.step,
        reason: issue.reason,
        message: issue.message,
      })),
      facebookUrl: pageUrl,
    },
  };
}
