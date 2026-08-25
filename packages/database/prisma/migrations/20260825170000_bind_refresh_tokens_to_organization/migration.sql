-- Bind new refresh tokens to the organization selected at sign-in.
-- Existing single-organization sessions remain compatible through the
-- application fallback until users sign in again.
ALTER TABLE "refresh_tokens" ADD COLUMN "organizationId" TEXT;

CREATE INDEX "refresh_tokens_organizationId_idx"
ON "refresh_tokens"("organizationId");

ALTER TABLE "refresh_tokens"
ADD CONSTRAINT "refresh_tokens_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
