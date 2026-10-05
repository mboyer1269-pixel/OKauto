import { sentryBeforeSend } from "@okauto/shared";

export async function register() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      release: process.env.APP_VERSION || process.env.GIT_SHA || undefined,
      environment: process.env.NODE_ENV ?? "production",
      sendDefaultPii: false,
      beforeSend: sentryBeforeSend,
    });
  } catch (err) {
    console.error("sentry init failed", err);
  }
}
