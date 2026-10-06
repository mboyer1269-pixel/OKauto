import { readEnv, sentryBeforeSend, type EnvMap } from "@okauto/shared";

let enabled = false;

export function sentryRelease(env?: EnvMap): string | undefined {
  const values = readEnv(env);
  const release = (values.APP_VERSION || values.GIT_SHA || "").trim();
  return release || undefined;
}

export async function initWorkerSentry(): Promise<boolean> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    console.log("sentry skipped: SENTRY_DSN unset");
    return false;
  }
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      release: sentryRelease(),
      environment: process.env.NODE_ENV ?? "production",
      sendDefaultPii: false,
      beforeSend: sentryBeforeSend,
    });
    enabled = true;
    console.log("sentry initialized");
    return true;
  } catch (err) {
    console.error("sentry init failed", err);
    return false;
  }
}

export async function captureWorkerException(err: unknown): Promise<void> {
  if (!enabled) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.captureException(err);
  } catch {
    // no-op when the SDK is unavailable
  }
}
