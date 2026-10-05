-- Additive only: new columns with defaults, plus marketplace_leads.
-- No drops or renames. Safe on the existing production database.

ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "monthlyListingLimit" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "listingRenewalDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN IF NOT EXISTS "listingLocale" TEXT NOT NULL DEFAULT 'fr',
ADD COLUMN IF NOT EXISTS "freightFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pdiFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "adminFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "acExciseFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "marketplaceMonthlyVehicleLimit" INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS "allInPriceConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "allInPriceConfirmedById" TEXT,
ADD COLUMN IF NOT EXISTS "listingLanguage" TEXT NOT NULL DEFAULT 'fr',
ADD COLUMN IF NOT EXISTS "listingHighlights" JSONB,
ADD COLUMN IF NOT EXISTS "metaCatalogFeedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "metaCatalogFeedToken" TEXT,
ADD COLUMN IF NOT EXISTS "metaCatalogStateForDemo" TEXT NOT NULL DEFAULT 'Used';

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_metaCatalogFeedToken_key"
ON "organizations"("metaCatalogFeedToken");

DO $$ BEGIN
  CREATE TYPE "FeedAbsenceStatus" AS ENUM ('IN_FEED', 'PENDING_REVIEW', 'KEPT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "vehicles"
ADD COLUMN IF NOT EXISTS "freightFee" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "pdiFee" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "adminFee" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "acExciseFee" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "descriptionEn" TEXT,
ADD COLUMN IF NOT EXISTS "feedAbsenceStatus" "FeedAbsenceStatus" NOT NULL DEFAULT 'IN_FEED',
ADD COLUMN IF NOT EXISTS "feedAbsenceNotedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "managerPriority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "managerPriorityNote" TEXT,
ADD COLUMN IF NOT EXISTS "managerPriorityById" TEXT,
ADD COLUMN IF NOT EXISTS "priceDroppedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "vehicles_organizationId_feedAbsenceStatus_idx"
ON "vehicles"("organizationId", "feedAbsenceStatus");

ALTER TABLE "listings"
ADD COLUMN IF NOT EXISTS "lastRenewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "renewalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "marketplacePrice" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "lastPriceConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "staleSince" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "removalReminderSentAt" TIMESTAMP(3);

UPDATE "listings"
SET "marketplacePrice" = "priceAtListing"
WHERE "marketplacePrice" IS NULL AND "priceAtListing" IS NOT NULL;

UPDATE "listings"
SET "staleSince" = COALESCE("lastCheckedAt", "updatedAt")
WHERE status = 'STALE' AND "staleSince" IS NULL;

ALTER TABLE "organization_members"
ADD COLUMN IF NOT EXISTS "marketplaceMonthlyVehicleLimit" INTEGER;

ALTER TABLE "marketplace_drafts"
ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'fr',
ADD COLUMN IF NOT EXISTS "titleEn" TEXT,
ADD COLUMN IF NOT EXISTS "descriptionEn" TEXT;

DO $$ BEGIN
  CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'APPOINTMENT', 'SOLD', 'LOST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeadSource" AS ENUM ('MARKETPLACE', 'PHONE', 'WALK_IN', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "marketplace_leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "listingId" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "message" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'MARKETPLACE',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "marketplace_leads_organizationId_status_createdAt_idx"
ON "marketplace_leads"("organizationId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "marketplace_leads_assignedToId_idx"
ON "marketplace_leads"("assignedToId");

CREATE INDEX IF NOT EXISTS "marketplace_leads_vehicleId_idx"
ON "marketplace_leads"("vehicleId");

DO $$ BEGIN
  ALTER TABLE "marketplace_leads"
  ADD CONSTRAINT "marketplace_leads_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_leads"
  ADD CONSTRAINT "marketplace_leads_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_leads"
  ADD CONSTRAINT "marketplace_leads_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_leads"
  ADD CONSTRAINT "marketplace_leads_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_leads"
  ADD CONSTRAINT "marketplace_leads_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
