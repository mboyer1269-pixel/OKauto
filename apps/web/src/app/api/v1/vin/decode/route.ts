import { decodeVin, isValidVin, normalizeVin } from "@lotpilot/core";
import { z } from "zod";
import { badRequest, handler, json, parseBody, requireUser, tooManyRequests } from "@/server/api";
import { env } from "@/server/env";
import { rateLimit } from "@/server/ratelimit";

const schema = z.object({ vin: z.string().trim().min(11).max(20) });

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  if (!rateLimit(`vin:${user.id}`, 60, 60_000)) throw tooManyRequests();
  const { vin } = await parseBody(req, schema);
  const normalized = normalizeVin(vin);
  if (!isValidVin(normalized)) {
    throw badRequest(`"${normalized}" is not a valid 17-character VIN (check digit failed)`);
  }
  const result = await decodeVin(normalized, { online: env.vinDecoderOnline });
  return json({ decoded: result });
});
