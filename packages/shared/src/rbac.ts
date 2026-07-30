import type { Role } from "./enums.js";

export const PERMISSIONS = [
  "org:read",
  "org:update",
  "member:read",
  "member:invite",
  "member:update-role",
  "member:deactivate",
  "vehicle:read",
  "vehicle:create",
  "vehicle:update",
  "vehicle:archive",
  "vehicle:mark-sold",
  "vehicle:bulk",
  "import:read",
  "import:manage",
  "import:run",
  "listing:read",
  "listing:read-all",
  "listing:create",
  "listing:update",
  "listing:transition-own",
  "listing:transition-all",
  "description:generate",
  "template:manage",
  "notification:read",
  "analytics:read",
  "audit:read",
  "extension:token:manage-own",
  "extension:token:manage-all",
  "admin:orgs",
  "admin:jobs",
  "admin:audit",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const SALESPERSON_PERMISSIONS: readonly Permission[] = [
  "org:read",
  "member:read",
  "vehicle:read",
  "vehicle:create",
  "vehicle:update",
  "vehicle:mark-sold",
  "import:read",
  "listing:read",
  "listing:create",
  "listing:update",
  "listing:transition-own",
  "description:generate",
  "notification:read",
  "extension:token:manage-own",
];

const MANAGER_PERMISSIONS: readonly Permission[] = [
  ...SALESPERSON_PERMISSIONS,
  "member:invite",
  "member:update-role",
  "member:deactivate",
  "vehicle:archive",
  "vehicle:bulk",
  "import:manage",
  "import:run",
  "listing:read-all",
  "listing:transition-all",
  "template:manage",
  "analytics:read",
  "audit:read",
];

const OWNER_PERMISSIONS: readonly Permission[] = [...MANAGER_PERMISSIONS, "org:update", "extension:token:manage-all"];

const PLATFORM_ADMIN_EXTRA: readonly Permission[] = ["admin:orgs", "admin:jobs", "admin:audit"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PLATFORM_ADMIN: PLATFORM_ADMIN_EXTRA,
  ORG_OWNER: OWNER_PERMISSIONS,
  ORG_MANAGER: MANAGER_PERMISSIONS,
  SALESPERSON: SALESPERSON_PERMISSIONS,
};

export function rolePermissions(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role | null | undefined, permission: Permission, isPlatformAdmin = false): boolean {
  if (isPlatformAdmin) return true;
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertPermission(
  role: Role | null | undefined,
  permission: Permission,
  isPlatformAdmin = false,
): void {
  if (!hasPermission(role, permission, isPlatformAdmin)) {
    const err = new Error(`Missing permission: ${permission}`);
    (err as { code?: string }).code = "FORBIDDEN";
    throw err;
  }
}

/** Roles that may be assigned by an actor with member:update-role, given the actor's own role. */
export function assignableRoles(actorRole: Role): Role[] {
  if (actorRole === "ORG_OWNER") return ["ORG_OWNER", "ORG_MANAGER", "SALESPERSON"];
  if (actorRole === "ORG_MANAGER") return ["ORG_MANAGER", "SALESPERSON"];
  return [];
}
