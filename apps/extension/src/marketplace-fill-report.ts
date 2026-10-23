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
  vin: "NIV",
  stockNumber: "Numéro de stock",
};

const STEP_LABELS_FR: Record<string, string> = {
  select_vehicleType: "sélection du type de véhicule",
  select_year: "sélection de l’année",
  select_make: "sélection de la marque",
  fill_model: "saisie du modèle",
  fill_mileage: "saisie du kilométrage",
  fill_title: "saisie du titre",
  fill_price: "saisie du prix",
  fill_description: "saisie de la description",
  select_bodyStyle: "sélection du style de carrosserie",
  select_exteriorColor: "sélection de la couleur extérieure",
  select_fuelType: "sélection du type de carburant",
  select_transmission: "sélection de la transmission",
  attach_photos: "ajout des photos",
  find_photo_input: "ajout des photos",
  fill_vin: "saisie du NIV",
  fill_stockNumber: "saisie du numéro de stock",
};

export function fieldLabelFr(field: string): string {
  return FIELD_LABELS_FR[field] ?? field;
}

function lowerFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function stepLabelFr(step: string, field?: string): string {
  if (STEP_LABELS_FR[step]) return STEP_LABELS_FR[step];
  const fieldLabel = field ? lowerFirst(fieldLabelFr(field)) : "";
  if (step.startsWith("select_") && fieldLabel) {
    return `sélection de ${fieldLabel}`;
  }
  if (step.startsWith("fill_") && fieldLabel) {
    return `saisie de ${fieldLabel}`;
  }
  if (step.startsWith("find_") && fieldLabel) {
    return `recherche de ${fieldLabel}`;
  }
  if (step.startsWith("attach_") && fieldLabel) {
    return `ajout de ${fieldLabel}`;
  }
  if (fieldLabel) return fieldLabel;
  return "cette étape du formulaire";
}

export function missingFieldIssue(
  field: string,
  step = `find_${field}`,
): FillIssue {
  const label = fieldLabelFr(field);
  const stepLabel = stepLabelFr(step, field);
  return {
    field,
    step,
    reason: "missing_field",
    message: `Champ « ${label} » introuvable dans le formulaire Facebook (étape « ${stepLabel} »).`,
  };
}

export function missingOptionIssue(
  field: string,
  option: string,
  step = `select_${field}`,
): FillIssue {
  const label = fieldLabelFr(field);
  const stepLabel = stepLabelFr(step, field);
  return {
    field,
    step,
    reason: "missing_option",
    message: `L’option « ${option} » n’a pas pu être sélectionnée pour ${label} (étape « ${stepLabel} »).`,
  };
}

export function exceptionIssue(
  field: string,
  step: string,
  detail: string,
): FillIssue {
  const label = fieldLabelFr(field);
  const stepLabel = stepLabelFr(step, field);
  return {
    field,
    step,
    reason: "exception",
    message: `L’étape « ${label} » a échoué (${stepLabel}) : ${detail}`,
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
  const stepLabel = stepLabelFr(first.step, first.field);
  return `Remplissage interrompu à l’étape « ${stepLabel} ». ${first.message}`;
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
