-- Additive: collapse extra ACTIVE listings, then enforce one ACTIVE
-- listing per (organization, vehicle, platform). REMOVED/STALE/SOLD
-- history is preserved so a vehicle can be listed again later.

-- Keep the oldest ACTIVE row in each group; mark extras STALE so the
-- unique index cannot fail on existing production duplicates.
UPDATE "listings" AS extra
SET
  status = 'STALE',
  "staleSince" = COALESCE(extra."staleSince", NOW())
WHERE extra.id IN (
  SELECT ranked.id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "organizationId", "vehicleId", platform
        ORDER BY "listedAt" ASC, id ASC
      ) AS rn
    FROM "listings"
    WHERE status = 'ACTIVE'
  ) ranked
  WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "listings_org_vehicle_platform_active_key"
ON "listings" ("organizationId", "vehicleId", "platform")
WHERE status = 'ACTIVE';
