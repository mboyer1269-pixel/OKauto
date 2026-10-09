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

-- Comptes créés par une organisation dont ils ne sont plus membres.
SELECT
  u.id AS user_id,
  u.email,
  u."createdAt" AS user_created_at,
  u."isActive" AS is_active,
  u."provisionedByOrganizationId" AS provisioned_by_organization_id,
  o.name AS provisioned_by_organization_name
FROM users AS u
LEFT JOIN organizations AS o ON o.id = u."provisionedByOrganizationId"
WHERE u."provisionedByOrganizationId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM organization_members AS m
    WHERE m."userId" = u.id
      AND m."organizationId" = u."provisionedByOrganizationId"
  )
ORDER BY u.email;
