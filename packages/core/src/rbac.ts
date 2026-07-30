import { type OrgRole } from "./types.js";

const ROLE_RANK: Record<OrgRole, number> = {
  SALESPERSON: 1,
  MANAGER: 2,
  OWNER: 3,
};

/** True when `actual` meets or exceeds `required` in the org role hierarchy. */
export function roleAtLeast(actual: OrgRole, required: OrgRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** Which roles a given actor role may assign/manage (owners manage everyone; managers manage salespeople). */
export function canManageRole(actor: OrgRole, target: OrgRole): boolean {
  if (actor === "OWNER") return true;
  if (actor === "MANAGER") return target === "SALESPERSON";
  return false;
}
