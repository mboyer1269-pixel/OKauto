/** Structured JSON logging for the worker (mirrors the web app's format). */
export function log(level: "info" | "warn" | "error", message: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level, source: "worker", message, time: new Date().toISOString(), ...extra }));
}
