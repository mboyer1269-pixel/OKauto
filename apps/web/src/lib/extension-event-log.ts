const FAILURE_EVENTS = new Set(["listing_error"]);

const METADATA_ALLOWLIST = [
  "source",
  "filled",
  "failedFields",
  "facebookUrl",
  "externalUrl",
] as const;

const MAX_STRING_CHARS = 240;
const MAX_ARRAY_ITEMS = 24;
const MAX_OBJECT_KEYS = 24;
const MAX_LOG_JSON_CHARS = 2048;

function truncateString(value: string, max = MAX_STRING_CHARS): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function sanitizeUnknown(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[tronqué]";
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeUnknown(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      out[truncateString(key, 80)] = sanitizeUnknown(nested, depth + 1);
    }
    return out;
  }
  return undefined;
}

export function summarizeExtensionEventLog(input: {
  eventType: string;
  organizationId: string;
  vehicleId: string;
  listingId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    eventType: input.eventType,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    listingId: input.listingId ?? null,
  };

  const metadata = input.metadata ?? {};
  if (typeof metadata.source === "string" && metadata.source.trim()) {
    base.source = truncateString(metadata.source.trim(), 80);
  }

  if (!FAILURE_EVENTS.has(input.eventType)) {
    if (Array.isArray(metadata.filled)) {
      base.filledCount = metadata.filled.length;
    }
    return base;
  }

  const details: Record<string, unknown> = {};
  for (const key of METADATA_ALLOWLIST) {
    if (metadata[key] === undefined) continue;
    details[key] = sanitizeUnknown(metadata[key]);
  }

  const candidate = { ...base, metadata: details };
  if (JSON.stringify(candidate).length <= MAX_LOG_JSON_CHARS) {
    return candidate;
  }

  return {
    ...base,
    metadata: {
      source: details.source,
      filledCount: Array.isArray(metadata.filled)
        ? metadata.filled.length
        : undefined,
      failedFieldCount: Array.isArray(metadata.failedFields)
        ? metadata.failedFields.length
        : undefined,
      failedFields: Array.isArray(details.failedFields)
        ? (details.failedFields as unknown[]).slice(0, 5)
        : undefined,
    },
  };
}
