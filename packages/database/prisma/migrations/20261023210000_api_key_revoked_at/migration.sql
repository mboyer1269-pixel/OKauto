-- Track explicit revocation independently of isActive so every
-- authenticated request can reject revoked keys and cleanup can
-- delete only rows with a revocation timestamp.
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

UPDATE "api_keys"
SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP)
WHERE "isActive" = false
  AND "revokedAt" IS NULL;
