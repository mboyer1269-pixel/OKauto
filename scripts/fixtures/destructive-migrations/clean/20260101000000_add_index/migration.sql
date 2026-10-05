-- Additive expand: CREATE INDEX is allowed without ALLOW_DESTRUCTIVE.
CREATE INDEX IF NOT EXISTS "vehicles_stock_idx" ON "vehicles" ("stockNumber");
