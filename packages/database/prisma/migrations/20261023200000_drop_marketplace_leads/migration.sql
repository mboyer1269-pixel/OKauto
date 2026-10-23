-- DESTRUCTIVE: purges the unused Marketplace leads CRM.
-- Runs at prisma migrate deploy. Take an R2 offsite dump before production deploy.
-- See docs/qa/lot-0.3.6.md and deploy/RUNBOOK.md.

DROP TABLE IF EXISTS "marketplace_leads";
DROP TYPE IF EXISTS "LeadStatus";
DROP TYPE IF EXISTS "LeadSource";
