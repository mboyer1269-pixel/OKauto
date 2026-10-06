import { sentryBeforeSend } from "@okauto/shared";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    // webpackIgnore: keep the Node SDK out of the Next/webpack graph.
    // next.config serverExternalPackages copies it into standalone.
    const Sentry = await import(/* webpackIgnore: true */ "@sentry/node");
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
