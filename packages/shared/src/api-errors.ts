/**
 * Stable, machine-readable API error codes.
 *
 * HTTP `error` is always a Quebec French message for humans.
 * Clients must match `code` (and status), never the localized `error` text.
 */
export const ApiErrorCode = {
  API_KEY_REQUIRED: "API_KEY_REQUIRED",
  INVALID_API_KEY: "INVALID_API_KEY",
  API_KEY_NOT_FOUND: "API_KEY_NOT_FOUND",
  VEHICLE_NOT_FOUND: "VEHICLE_NOT_FOUND",
  LISTING_NOT_FOUND: "LISTING_NOT_FOUND",
  PHOTO_NOT_FOUND: "PHOTO_NOT_FOUND",
  INSECURE_PHOTO_URL: "INSECURE_PHOTO_URL",
  PHOTO_UNAVAILABLE: "PHOTO_UNAVAILABLE",
  UNSUPPORTED_PHOTO_FORMAT: "UNSUPPORTED_PHOTO_FORMAT",
  MARKETPLACE_ITEM_URL_REQUIRED: "MARKETPLACE_ITEM_URL_REQUIRED",
  VEHICLE_NOT_AVAILABLE: "VEHICLE_NOT_AVAILABLE",
  ACTIVE_LISTING_EXISTS: "ACTIVE_LISTING_EXISTS",
  SYNC_SOURCE_NOT_FOUND: "SYNC_SOURCE_NOT_FOUND",
  SYNC_QUEUE_UNAVAILABLE: "SYNC_QUEUE_UNAVAILABLE",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  FORBIDDEN: "FORBIDDEN",
  MEMBER_NOT_FOUND: "MEMBER_NOT_FOUND",
  CANNOT_CHANGE_OWNER_ROLE: "CANNOT_CHANGE_OWNER_ROLE",
  ONLY_OWNER_CAN_RESET_OWNER: "ONLY_OWNER_CAN_RESET_OWNER",
  CANNOT_REMOVE_OWNER: "CANNOT_REMOVE_OWNER",
  NOTIFICATION_NOT_FOUND: "NOTIFICATION_NOT_FOUND",
  STORAGE_NOT_CONFIGURED: "STORAGE_NOT_CONFIGURED",
  CSV_CONTENT_REQUIRED: "CSV_CONTENT_REQUIRED",
  CSV_HEADER_AND_ROW_REQUIRED: "CSV_HEADER_AND_ROW_REQUIRED",
  CSV_ROW_FAILED: "CSV_ROW_FAILED",
  ORGANIZATION_NOT_FOUND: "ORGANIZATION_NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_JSON: "INVALID_JSON",
  CONFLICT_UNIQUE: "CONFLICT_UNIQUE",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVENTORY_LOAD_FAILED: "INVENTORY_LOAD_FAILED",
} as const;

export type ApiErrorCodeType =
  (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export const API_ERROR_MESSAGES_FR: Record<ApiErrorCodeType, string> = {
  API_KEY_REQUIRED:
    "Clé API manquante. Ouvrez Suivia, page Clés API, créez-en une, puis collez-la dans Réglages.",
  INVALID_API_KEY:
    "Clé API refusée ou révoquée. Créez-en une nouvelle dans Suivia, page Clés API, puis collez-la dans Réglages.",
  API_KEY_NOT_FOUND:
    "Clé API introuvable. Actualisez la page Clés API, puis réessayez.",
  VEHICLE_NOT_FOUND:
    "Véhicule introuvable. Vérifiez qu’il est encore dans l’inventaire, puis réessayez.",
  LISTING_NOT_FOUND:
    "Annonce introuvable. Actualisez la page, puis réessayez.",
  PHOTO_NOT_FOUND:
    "Photo introuvable. Actualisez la fiche du véhicule, puis réessayez.",
  INSECURE_PHOTO_URL:
    "Seules les photos HTTPS de véhicules peuvent être téléchargées.",
  PHOTO_UNAVAILABLE:
    "Cette photo est temporairement inaccessible. Réessayez dans un moment.",
  UNSUPPORTED_PHOTO_FORMAT:
    "Format de photo non pris en charge. Utilisez JPEG, PNG ou WebP.",
  MARKETPLACE_ITEM_URL_REQUIRED:
    "L’URL d’une annonce Facebook Marketplace publiée est requise (elle doit contenir /marketplace/item/).",
  VEHICLE_NOT_AVAILABLE:
    "Seuls les véhicules encore en vente peuvent être publiés.",
  ACTIVE_LISTING_EXISTS:
    "Une annonce active existe déjà pour ce véhicule et cette plateforme.",
  SYNC_SOURCE_NOT_FOUND:
    "Source de synchronisation introuvable. Actualisez la page, puis réessayez.",
  SYNC_QUEUE_UNAVAILABLE:
    "La file de synchronisation est indisponible. Vérifiez que Redis fonctionne, puis réessayez.",
  AUTH_REQUIRED: "Authentification requise. Reconnectez-vous, puis réessayez.",
  ACCOUNT_DISABLED:
    "Ce compte est désactivé. Contactez un administrateur Suivia.",
  FORBIDDEN: "Accès insuffisant. Demandez un rôle plus élevé, puis réessayez.",
  MEMBER_NOT_FOUND:
    "Membre introuvable. Actualisez l’équipe, puis réessayez.",
  CANNOT_CHANGE_OWNER_ROLE:
    "Le rôle du propriétaire ne peut pas être modifié.",
  ONLY_OWNER_CAN_RESET_OWNER:
    "Seul le propriétaire peut réinitialiser le compte propriétaire.",
  CANNOT_REMOVE_OWNER:
    "Le propriétaire ne peut pas être retiré de l’équipe.",
  NOTIFICATION_NOT_FOUND:
    "Notification introuvable. Actualisez la page, puis réessayez.",
  STORAGE_NOT_CONFIGURED:
    "Le stockage S3 n’est pas configuré. Ajoutez la photo par URL, ou demandez à un administrateur de configurer AWS_S3_BUCKET et AWS_S3_PUBLIC_URL.",
  CSV_CONTENT_REQUIRED:
    "Le contenu CSV est requis. Collez le fichier, puis réessayez.",
  CSV_HEADER_AND_ROW_REQUIRED:
    "Le CSV doit contenir une ligne d’en-tête et au moins une ligne de données.",
  CSV_ROW_FAILED:
    "Impossible d’importer cette ligne. Vérifiez le NIV, le stock et l’année, puis réessayez.",
  ORGANIZATION_NOT_FOUND:
    "Concession introuvable. Reconnectez-vous, puis réessayez.",
  VALIDATION_ERROR: "Les données envoyées sont invalides",
  INVALID_JSON: "Le corps de la requête n’est pas un JSON valide",
  CONFLICT_UNIQUE: "Une fiche avec cette valeur existe déjà",
  RATE_LIMITED: "Trop de tentatives. Réessayez plus tard.",
  INTERNAL_ERROR:
    "Une erreur interne s'est produite. Réessayez plus tard.",
  INVENTORY_LOAD_FAILED:
    "Impossible de charger l’inventaire. Vérifiez la clé API et l’URL dans Réglages.",
};

const LEGACY_ENGLISH_TO_CODE: Record<string, ApiErrorCodeType> = {
  "API key required": ApiErrorCode.API_KEY_REQUIRED,
  "Invalid API key": ApiErrorCode.INVALID_API_KEY,
  "API key not found": ApiErrorCode.API_KEY_NOT_FOUND,
  "Vehicle not found": ApiErrorCode.VEHICLE_NOT_FOUND,
  "Listing not found": ApiErrorCode.LISTING_NOT_FOUND,
  "Photo not found": ApiErrorCode.PHOTO_NOT_FOUND,
  "Only secure vehicle photos can be downloaded":
    ApiErrorCode.INSECURE_PHOTO_URL,
  "Vehicle photo is temporarily unavailable": ApiErrorCode.PHOTO_UNAVAILABLE,
  "Unsupported vehicle photo format": ApiErrorCode.UNSUPPORTED_PHOTO_FORMAT,
  "A published Facebook Marketplace item URL is required":
    ApiErrorCode.MARKETPLACE_ITEM_URL_REQUIRED,
  "Only an available vehicle can be published":
    ApiErrorCode.VEHICLE_NOT_AVAILABLE,
  "An active listing already exists for this vehicle and platform":
    ApiErrorCode.ACTIVE_LISTING_EXISTS,
  "Sync source not found": ApiErrorCode.SYNC_SOURCE_NOT_FOUND,
  "Failed to queue sync job. Is Redis running?":
    ApiErrorCode.SYNC_QUEUE_UNAVAILABLE,
  Unauthorized: ApiErrorCode.ACCOUNT_DISABLED,
  "Member not found": ApiErrorCode.MEMBER_NOT_FOUND,
  "Cannot change owner role": ApiErrorCode.CANNOT_CHANGE_OWNER_ROLE,
  "Only the owner can reset the owner account":
    ApiErrorCode.ONLY_OWNER_CAN_RESET_OWNER,
  "Cannot remove owner": ApiErrorCode.CANNOT_REMOVE_OWNER,
  "Notification not found": ApiErrorCode.NOTIFICATION_NOT_FOUND,
  "S3 storage is not configured. Set AWS_S3_BUCKET and AWS_S3_PUBLIC_URL.":
    ApiErrorCode.STORAGE_NOT_CONFIGURED,
  "CSV content required": ApiErrorCode.CSV_CONTENT_REQUIRED,
  "CSV must have header and at least one row":
    ApiErrorCode.CSV_HEADER_AND_ROW_REQUIRED,
  "Unknown error": ApiErrorCode.CSV_ROW_FAILED,
  "Organization not found": ApiErrorCode.ORGANIZATION_NOT_FOUND,
  "Failed to load inventory": ApiErrorCode.INVENTORY_LOAD_FAILED,
  "Authentification requise": ApiErrorCode.AUTH_REQUIRED,
};

export function isApiErrorCode(value: unknown): value is ApiErrorCodeType {
  return (
    typeof value === "string" &&
    Object.values(ApiErrorCode).includes(value as ApiErrorCodeType)
  );
}

export function apiErrorMessageFr(code: ApiErrorCodeType): string {
  return API_ERROR_MESSAGES_FR[code];
}

export function resolveApiErrorCode(
  status: number,
  body: { error?: unknown; code?: unknown } | null | undefined,
): ApiErrorCodeType | undefined {
  if (isApiErrorCode(body?.code)) return body.code;
  if (typeof body?.error === "string") {
    const mapped = LEGACY_ENGLISH_TO_CODE[body.error];
    if (mapped) return mapped;
  }
  if (status === 429) return ApiErrorCode.RATE_LIMITED;
  return undefined;
}

/**
 * Pick a Quebec French message for humans. Prefer a known `code`, then a
 * French `error` already returned by the API, then a mapped legacy English
 * string. Never surface raw English fallbacks from older servers.
 */
export function userFacingApiError(
  status: number,
  body: { error?: unknown; code?: unknown } | null | undefined,
  fallback?: string,
): string {
  const code = resolveApiErrorCode(status, body);
  if (code) return apiErrorMessageFr(code);
  if (typeof body?.error === "string" && body.error.trim()) {
    return body.error;
  }
  return fallback ?? apiErrorMessageFr(ApiErrorCode.INTERNAL_ERROR);
}

export function chromeRuntimeErrorFr(message: string | undefined): string {
  const value = (message ?? "").trim();
  if (!value) {
    return "L’extension n’a pas pu communiquer avec Suivia. Rechargez la page Facebook, puis réessayez.";
  }
  if (/could not establish connection/i.test(value)) {
    return "Connexion à l’extension perdue. Rechargez l’onglet Facebook, puis relancez la publication.";
  }
  if (/message port closed/i.test(value)) {
    return "La communication avec l’extension s’est interrompue. Rechargez l’onglet, puis réessayez.";
  }
  if (/extension context invalidated/i.test(value)) {
    return "L’extension a été mise à jour. Rechargez l’onglet Facebook, puis relancez la publication.";
  }
  if (/receiving end does not exist/i.test(value)) {
    return "L’assistant Suivia n’est pas actif sur cette page. Ouvrez Facebook Marketplace, puis réessayez.";
  }
  return `Étape d’extension interrompue : ${value}`;
}
