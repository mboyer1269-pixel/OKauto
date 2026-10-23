-- Additive: look up and protect Facebook Marketplace item IDs.
-- externalId was unused until the extension started capturing it.

CREATE INDEX IF NOT EXISTS "listings_organizationId_externalId_idx"
ON "listings" ("organizationId", "externalId");

CREATE UNIQUE INDEX IF NOT EXISTS "listings_org_platform_externalId_active_key"
ON "listings" ("organizationId", "platform", "externalId")
WHERE status = 'ACTIVE' AND "externalId" IS NOT NULL AND "externalId" <> '';
