-- Lecture seule. Ne modifie aucune donnée.
-- Comptes rattachés à plus d'une organisation, avec la date de chaque
-- rattachement. Un compte multi-concession n'est jamais réinitialisable
-- par une concession (pas de « concession créatrice » automatique).

SELECT
  u.id AS user_id,
  u.email,
  u."createdAt" AS user_created_at,
  u."provisionedByOrganizationId" AS provisioned_by_organization_id,
  o.id AS organization_id,
  o.name AS organization_name,
  m.role,
  m."joinedAt" AS joined_at
FROM users AS u
JOIN organization_members AS m ON m."userId" = u.id
JOIN organizations AS o ON o.id = m."organizationId"
WHERE u.id IN (
  SELECT "userId"
  FROM organization_members
  GROUP BY "userId"
  HAVING COUNT(*) > 1
)
ORDER BY u.email, m."joinedAt";
