-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'manager', 'salesperson', 'viewer');
CREATE TYPE "VehicleType" AS ENUM ('automotive', 'rv', 'marine', 'powersports', 'commercial', 'other');
CREATE TYPE "VehicleStatus" AS ENUM ('available', 'pending', 'listed', 'sold', 'archived');
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'prepared', 'filled', 'submitted', 'active', 'removed', 'sold', 'failed');
CREATE TYPE "SourceType" AS ENUM ('csv', 'xml', 'website', 'manual');
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'partial');
CREATE TYPE "NotificationType" AS ENUM ('sold_vehicle', 'price_change', 'sync_failed', 'sync_succeeded', 'invite', 'system');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Dealership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Dealership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealershipId" TEXT,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealershipId" TEXT,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventorySource" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastStatus" "SyncStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventorySource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stats" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "sourceId" TEXT,
    "externalId" TEXT,
    "vin" TEXT,
    "stockNumber" TEXT,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'automotive',
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "trim" TEXT,
    "bodyStyle" TEXT,
    "exteriorColor" TEXT,
    "interiorColor" TEXT,
    "mileage" INTEGER,
    "price" DECIMAL(12,2),
    "previousPrice" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "aiDescription" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'available',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "lastSeenAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleMedia" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'facebook_marketplace',
    "status" "ListingStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT,
    "price" DECIMAL(12,2),
    "description" TEXT,
    "externalListingId" TEXT,
    "externalUrl" TEXT,
    "preparedPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ListingEvent" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DescriptionGeneration" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "promptHash" TEXT,
    "output" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DescriptionGeneration_pkey" PRIMARY KEY ("id")
);

-- Indexes & uniques
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Dealership_organizationId_idx" ON "Dealership"("organizationId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE UNIQUE INDEX "Membership_userId_organizationId_dealershipId_key" ON "Membership"("userId", "organizationId", "dealershipId");
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");
CREATE INDEX "Invite_organizationId_email_idx" ON "Invite"("organizationId", "email");
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");
CREATE INDEX "ApiToken_organizationId_idx" ON "ApiToken"("organizationId");
CREATE INDEX "InventorySource_dealershipId_idx" ON "InventorySource"("dealershipId");
CREATE INDEX "SyncRun_sourceId_startedAt_idx" ON "SyncRun"("sourceId", "startedAt");
CREATE UNIQUE INDEX "Vehicle_dealershipId_vin_key" ON "Vehicle"("dealershipId", "vin");
CREATE INDEX "Vehicle_dealershipId_status_idx" ON "Vehicle"("dealershipId", "status");
CREATE INDEX "Vehicle_dealershipId_stockNumber_idx" ON "Vehicle"("dealershipId", "stockNumber");
CREATE INDEX "Vehicle_make_model_idx" ON "Vehicle"("make", "model");
CREATE INDEX "VehicleMedia_vehicleId_sortOrder_idx" ON "VehicleMedia"("vehicleId", "sortOrder");
CREATE INDEX "Listing_dealershipId_status_idx" ON "Listing"("dealershipId", "status");
CREATE INDEX "Listing_salespersonId_createdAt_idx" ON "Listing"("salespersonId", "createdAt");
CREATE INDEX "Listing_vehicleId_idx" ON "Listing"("vehicleId");
CREATE INDEX "ListingEvent_listingId_createdAt_idx" ON "ListingEvent"("listingId", "createdAt");
CREATE INDEX "ListingEvent_type_createdAt_idx" ON "ListingEvent"("type", "createdAt");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "DescriptionGeneration_vehicleId_createdAt_idx" ON "DescriptionGeneration"("vehicleId", "createdAt");

-- FKs
ALTER TABLE "Dealership" ADD CONSTRAINT "Dealership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventorySource" ADD CONSTRAINT "InventorySource_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "InventorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "InventorySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleMedia" ADD CONSTRAINT "VehicleMedia_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DescriptionGeneration" ADD CONSTRAINT "DescriptionGeneration_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
