-- Additive: remember which fields came from vPIC, and when the last retry happened.
ALTER TABLE "vehicles"
ADD COLUMN IF NOT EXISTS "vinDecodedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "vinDecodeLastAttemptAt" TIMESTAMP(3);
