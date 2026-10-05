const REDACT = "[Filtered]";

const SENSITIVE_KEY =
  /^(email|password|pass|token|authorization|cookie|set-cookie|secret|jwt|phone|ssn|vin|otp|api[-_]?key|access[-_]?key|refresh[-_]?token)$/i;

export type SentryLikeEvent = {
  user?: Record<string, unknown> | null;
  request?: {
    headers?: Record<string, string>;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
    url?: string;
  };
  extra?: Record<string, unknown>;
};

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || /cookie|authorization|token/i.test(key);
}

export function stripQuery(url: string): string {
  const cut = url.indexOf("?");
  return cut === -1 ? url : url.slice(0, cut);
}

export function sentryBeforeSend<T extends SentryLikeEvent>(
  event: T,
): T | null {
  if (event.user) {
    const id = event.user.id;
    event.user = typeof id === "string" || typeof id === "number" ? { id } : {};
  }
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) {
      event.request.url = stripQuery(event.request.url);
    }
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (isSensitiveKey(key)) {
          event.request.headers[key] = REDACT;
        }
      }
    }
  }
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (isSensitiveKey(key)) {
        event.extra[key] = REDACT;
      }
    }
  }
  return event;
}
