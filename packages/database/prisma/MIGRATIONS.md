# Expand / contract for Prisma migrations
#
# Image rollback re-pulls the previous SHA. It does **not** undo SQL already
# applied by `prisma migrate deploy`. Therefore every migration that ships
# with a release must keep the previous app version working.
#
# Expand (safe, default): ADD COLUMN nullable or with DEFAULT, CREATE TABLE,
# CREATE INDEX. Deploy app that reads old+new shape, then a later release
# may backfill.
#
# Contract (unsafe for automatic rollback): DROP TABLE/COLUMN, RENAME,
# ALTER TYPE, SET NOT NULL without a prior default. These require:
#   1. A previous release that already stopped reading the dropped shape
#   2. File ALLOW_DESTRUCTIVE in the migration folder (CI override)
#   3. A pre-deploy dump and a manual restore plan in deploy/RUNBOOK.md
#
# CI: `scripts/check-destructive-migrations.sh` (job `quality`).
