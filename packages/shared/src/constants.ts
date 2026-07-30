export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

export const PAGINATION_DEFAULT_LIMIT = 25;
export const PAGINATION_MAX_LIMIT = 100;

export const PASSWORD_MIN_LENGTH = 10;
export const VEHICLE_TITLE_MAX = 150;
export const DESCRIPTION_MAX = 9000;
export const MAX_BULK_IDS = 200;
export const MAX_CSV_ROWS = 5000;
export const MAX_PHOTOS_PER_VEHICLE = 40;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const EXTENSION_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;
export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export const JOB_DEFAULT_MAX_ATTEMPTS = 5;
export const JOB_BACKOFF_BASE_MS = 2000;

export const SSE_HEARTBEAT_MS = 25000;
