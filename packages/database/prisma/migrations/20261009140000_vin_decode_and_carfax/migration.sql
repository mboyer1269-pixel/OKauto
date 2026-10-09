-- Additive only: VIN decode tracking and optional Carfax source URL in listings.
-- Safe on the existing production database (nullable columns or DEFAULT).

ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "includeCarfaxSourceUrl" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "vehicles"
ADD COLUMN IF NOT EXISTS "includeCarfaxSourceUrl" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "vinDecodedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "vinDecodedVin" TEXT;

CREATE INDEX IF NOT EXISTS "vehicles_vinDecodedAt_idx"
ON "vehicles"("vinDecodedAt");
