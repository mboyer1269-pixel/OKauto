ALTER TABLE "listings"
ADD COLUMN "titleAtListing" TEXT,
ADD COLUMN "descriptionAtListing" TEXT,
ADD COLUMN "photoUrlsAtListing" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "vehicles"
ADD COLUMN "lastSeenAt" TIMESTAMP(3),
ADD COLUMN "missingSyncCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "marketplace_drafts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'facebook_marketplace',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photoOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "generationSource" TEXT NOT NULL DEFAULT 'template',
    "dataSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_drafts_organizationId_userId_vehicleId_platform_key"
ON "marketplace_drafts"("organizationId", "userId", "vehicleId", "platform");

CREATE INDEX "marketplace_drafts_userId_updatedAt_idx"
ON "marketplace_drafts"("userId", "updatedAt");

CREATE INDEX "marketplace_drafts_vehicleId_idx"
ON "marketplace_drafts"("vehicleId");

ALTER TABLE "marketplace_drafts"
ADD CONSTRAINT "marketplace_drafts_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_drafts"
ADD CONSTRAINT "marketplace_drafts_vehicleId_fkey"
FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_drafts"
ADD CONSTRAINT "marketplace_drafts_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "syncSourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "expectedCount" INTEGER,
    "receivedCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "priceChanges" INTEGER NOT NULL DEFAULT 0,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_runs_organizationId_startedAt_idx"
ON "sync_runs"("organizationId", "startedAt");

CREATE INDEX "sync_runs_syncSourceId_startedAt_idx"
ON "sync_runs"("syncSourceId", "startedAt");

ALTER TABLE "sync_runs"
ADD CONSTRAINT "sync_runs_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sync_runs"
ADD CONSTRAINT "sync_runs_syncSourceId_fkey"
FOREIGN KEY ("syncSourceId") REFERENCES "sync_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
