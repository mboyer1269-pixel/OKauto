-- Additive branding fields. Existing dealership rows keep their current name
-- and contact details; Buckingham-named accounts also receive default brands.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brands" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "dealerCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "organizations"
SET
  "brands" = ARRAY['Chevrolet', 'Buick', 'GMC']::TEXT[],
  "dealerCodes" = ARRAY['GM']::TEXT[]
WHERE "name" ILIKE '%Buckingham%'
  AND cardinality("brands") = 0;
