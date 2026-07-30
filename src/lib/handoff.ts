import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { env } from "@/lib/env";
import { ApiError } from "@/lib/http";

const claimsSchema = z.object({
  version: z.literal(1),
  listingId: z.uuid(),
  organizationId: z.uuid(),
  userId: z.uuid(),
  expiresAt: z.number().int(),
  nonce: z.string().min(16),
});

export type HandoffClaims = z.infer<typeof claimsSchema>;

function signature(payload: string): Buffer {
  return createHmac("sha256", env().SESSION_PEPPER).update(`driveflow-handoff:${payload}`).digest();
}

export function createHandoffToken(input: Omit<HandoffClaims, "version" | "expiresAt" | "nonce">): string {
  const claims: HandoffClaims = {
    version: 1,
    ...input,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyHandoffToken(token: string): HandoffClaims {
  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra) throw new ApiError(401, "INVALID_HANDOFF", "The preparation code is invalid.");
  const supplied = Buffer.from(encodedSignature, "base64url");
  const expected = signature(payload);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ApiError(401, "INVALID_HANDOFF", "The preparation code is invalid.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(401, "INVALID_HANDOFF", "The preparation code is invalid.");
  }
  const claims = claimsSchema.parse(decoded);
  if (claims.expiresAt <= Date.now()) throw new ApiError(401, "HANDOFF_EXPIRED", "The preparation code expired. Prepare the listing again.");
  return claims;
}
