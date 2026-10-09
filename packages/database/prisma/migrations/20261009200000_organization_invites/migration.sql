-- Additive: pending team invitations. Token is stored hashed; the raw
-- value is shown once to the admin (no email is sent by the app).

CREATE TABLE IF NOT EXISTS "organization_invites" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'SALESPERSON',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "invitedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_invites_tokenHash_key"
ON "organization_invites"("tokenHash");

CREATE INDEX IF NOT EXISTS "organization_invites_organizationId_email_idx"
ON "organization_invites"("organizationId", "email");

CREATE INDEX IF NOT EXISTS "organization_invites_expiresAt_idx"
ON "organization_invites"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_invites_organizationId_fkey'
  ) THEN
    ALTER TABLE "organization_invites"
    ADD CONSTRAINT "organization_invites_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_invites_invitedById_fkey'
  ) THEN
    ALTER TABLE "organization_invites"
    ADD CONSTRAINT "organization_invites_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
