/**
 * Centralized role-based access control. A single source of truth for
 * (role, action) -> boolean, plus helpers for ownership-scoped checks.
 */
import type { Role } from './types.js';

export const ACTIONS = [
  'org:read',
  'org:update',
  'org:delete',
  'member:invite',
  'member:read',
  'member:update',
  'member:remove',
  'vehicle:read',
  'vehicle:create',
  'vehicle:update',
  'vehicle:delete',
  'vehicle:import',
  'listing:read:any',
  'listing:read:own',
  'listing:create',
  'listing:update:any',
  'listing:update:own',
  'listing:delete:any',
  'listing:delete:own',
  'analytics:read:any',
  'analytics:read:own',
  'notification:read',
  'audit:read',
  'token:manage',
  'platform:admin',
] as const;
export type Action = (typeof ACTIONS)[number];

const OWNER_ADMIN: Action[] = [
  'org:read',
  'org:update',
  'member:invite',
  'member:read',
  'member:update',
  'member:remove',
  'vehicle:read',
  'vehicle:create',
  'vehicle:update',
  'vehicle:delete',
  'vehicle:import',
  'listing:read:any',
  'listing:read:own',
  'listing:create',
  'listing:update:any',
  'listing:update:own',
  'listing:delete:any',
  'listing:delete:own',
  'analytics:read:any',
  'analytics:read:own',
  'notification:read',
  'audit:read',
  'token:manage',
];

const MANAGER: Action[] = [
  'org:read',
  'member:read',
  'vehicle:read',
  'vehicle:create',
  'vehicle:update',
  'vehicle:delete',
  'vehicle:import',
  'listing:read:any',
  'listing:read:own',
  'listing:create',
  'listing:update:any',
  'listing:update:own',
  'listing:delete:own',
  'analytics:read:any',
  'analytics:read:own',
  'notification:read',
  'token:manage',
];

const SALESPERSON: Action[] = [
  'org:read',
  'member:read',
  'vehicle:read',
  'listing:read:own',
  'listing:create',
  'listing:update:own',
  'listing:delete:own',
  'analytics:read:own',
  'notification:read',
  'token:manage',
];

const VIEWER: Action[] = [
  'org:read',
  'member:read',
  'vehicle:read',
  'listing:read:own',
  'analytics:read:own',
  'notification:read',
];

const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  SUPERADMIN: new Set([...ACTIONS]),
  OWNER: new Set([...OWNER_ADMIN, 'org:delete']),
  ADMIN: new Set(OWNER_ADMIN),
  MANAGER: new Set(MANAGER),
  SALESPERSON: new Set(SALESPERSON),
  VIEWER: new Set(VIEWER),
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[role]?.has(action) ?? false;
}

/**
 * Resolve whether a role can perform an action on a resource, considering ownership.
 * For actions that have `:any` and `:own` variants, pass the base (e.g. 'listing:update')
 * and whether the actor owns the resource.
 */
export function canAct(
  role: Role,
  base: 'listing:read' | 'listing:update' | 'listing:delete' | 'analytics:read',
  isOwner: boolean,
): boolean {
  if (can(role, `${base}:any` as Action)) return true;
  if (isOwner && can(role, `${base}:own` as Action)) return true;
  return false;
}

export function rolesThatCan(action: Action): Role[] {
  return (Object.keys(PERMISSIONS) as Role[]).filter((r) => can(r, action));
}
