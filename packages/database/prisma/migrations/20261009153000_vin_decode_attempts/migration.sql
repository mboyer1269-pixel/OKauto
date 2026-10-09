-- Additive: retry counters so a vPIC outage does not stamp NIVs as decoded.
-- Safe on the existing production database (DEFAULT 0 / nullable).

ALTER TABLE "vehicles"
ADD COLUMN IF NOT EXISTS "vinDecodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "vinDecodeError" TEXT;
