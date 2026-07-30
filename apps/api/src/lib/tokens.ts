import { createHash, randomBytes } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface ExtensionTokenParts {
  /** Full plaintext token, returned exactly once to the caller. */
  plaintext: string;
  /** Public prefix stored for lookup UX + fast rejection. */
  prefix: string;
  /** sha256 hash persisted in the DB. */
  tokenHash: string;
}

export function generateExtensionToken(): ExtensionTokenParts {
  const secret = randomToken(32);
  const plaintext = `oka_ext_${secret}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 16),
    tokenHash: sha256(plaintext),
  };
}

export const EXTENSION_TOKEN_PREFIX = "oka_ext_";
