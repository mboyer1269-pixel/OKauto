const REDACT = "[Filtered]";

const SENSITIVE_KEY =
  /^(email|password|pass|token|authorization|cookie|set-cookie|secret|jwt|phone|ssn|vin|otp|api[-_]?key|access[-_]?key|refresh[-_]?token)$/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?<!\d)(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]*)\d{3}[-.\s]?\d{4}(?!\d)/g;

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
  exception?: {
    values?: Array<{ value?: string; type?: string }>;
  };
  breadcrumbs?: Array<{
    message?: string;
    data?: Record<string, unknown>;
    category?: string;
  }>;
};

export type SentryLikeBreadcrumb = {
  message?: string;
  data?: Record<string, unknown>;
  category?: string;
};

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || /cookie|authorization|token/i.test(key);
}

export function stripQuery(url: string): string {
  const cut = url.indexOf("?");
  return cut === -1 ? url : url.slice(0, cut);
}

export function redactPiiText(value: string): string {
  return value.replace(EMAIL_RE, REDACT).replace(PHONE_RE, REDACT);
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
      } else if (typeof event.extra[key] === "string") {
        event.extra[key] = redactPiiText(event.extra[key]);
      }
    }
  }
  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (typeof value.value === "string") {
        value.value = redactPiiText(value.value);
      }
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) =>
      sentryBeforeBreadcrumb(crumb),
    );
  }
  return event;
}

export function sentryBeforeBreadcrumb<T extends SentryLikeBreadcrumb>(
  breadcrumb: T,
): T {
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = redactPiiText(breadcrumb.message);
  }
  if (breadcrumb.data) {
    for (const key of Object.keys(breadcrumb.data)) {
      if (isSensitiveKey(key)) {
        breadcrumb.data[key] = REDACT;
      } else if (typeof breadcrumb.data[key] === "string") {
        breadcrumb.data[key] = redactPiiText(breadcrumb.data[key]);
      }
    }
  }
  return breadcrumb;
}
