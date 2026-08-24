ALTER TABLE "vehicles"
ADD COLUMN "syncSourceId" TEXT,
ADD COLUMN "sourceUrl" TEXT;

CREATE INDEX "vehicles_syncSourceId_idx" ON "vehicles"("syncSourceId");

ALTER TABLE "vehicles"
ADD CONSTRAINT "vehicles_syncSourceId_fkey"
FOREIGN KEY ("syncSourceId") REFERENCES "sync_sources"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
