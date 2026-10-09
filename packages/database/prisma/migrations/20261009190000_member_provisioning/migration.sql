-- Additive: remember which dealership created a staff account, and when
-- sessions were invalidated (password reset). Safe on existing databases.

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "provisionedByOrganizationId" TEXT,
ADD COLUMN IF NOT EXISTS "sessionInvalidatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_provisionedByOrganizationId_idx"
ON "users"("provisionedByOrganizationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_provisionedByOrganizationId_fkey'
  ) THEN
    ALTER TABLE "users"
    ADD CONSTRAINT "users_provisionedByOrganizationId_fkey"
    FOREIGN KEY ("provisionedByOrganizationId") REFERENCES "organizations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Legacy staff invited by a dealership (single non-OWNER membership).
UPDATE "users" AS u
SET "provisionedByOrganizationId" = m."organizationId"
FROM "organization_members" AS m
WHERE u.id = m."userId"
  AND u."provisionedByOrganizationId" IS NULL
  AND m.role <> 'OWNER'
  AND NOT EXISTS (
    SELECT 1
    FROM "organization_members" AS other
    WHERE other."userId" = u.id
      AND other.id <> m.id
  );
