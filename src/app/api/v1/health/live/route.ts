import { json } from "@/lib/http";

export function GET(): Response {
  return json({ status: "ok", service: "driveflow", timestamp: new Date().toISOString() });
}
