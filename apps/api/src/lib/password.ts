import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

/**
 * Hash a password with scrypt (Node built-in; no native deps).
 * Format: scrypt$N$r$p$saltHex$hashHex
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  })) as Buffer;
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex!, "hex");
  const expected = Buffer.from(hashHex!, "hex");
  const derived = (await scryptAsync(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  })) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
