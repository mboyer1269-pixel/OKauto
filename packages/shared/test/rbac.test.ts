import { describe, expect, it } from "vitest";
import { assignableRoles, assertPermission, hasPermission } from "../src/rbac.js";

describe("rbac", () => {
  it("salesperson can manage own listings but not org settings", () => {
    expect(hasPermission("SALESPERSON", "listing:create")).toBe(true);
    expect(hasPermission("SALESPERSON", "listing:transition-own")).toBe(true);
    expect(hasPermission("SALESPERSON", "listing:transition-all")).toBe(false);
    expect(hasPermission("SALESPERSON", "org:update")).toBe(false);
    expect(hasPermission("SALESPERSON", "member:invite")).toBe(false);
  });

  it("manager manages team + listings but not org settings", () => {
    expect(hasPermission("ORG_MANAGER", "member:invite")).toBe(true);
    expect(hasPermission("ORG_MANAGER", "listing:transition-all")).toBe(true);
    expect(hasPermission("ORG_MANAGER", "analytics:read")).toBe(true);
    expect(hasPermission("ORG_MANAGER", "org:update")).toBe(false);
  });

  it("owner has everything org-scoped", () => {
    expect(hasPermission("ORG_OWNER", "org:update")).toBe(true);
    expect(hasPermission("ORG_OWNER", "extension:token:manage-all")).toBe(true);
    expect(hasPermission("ORG_OWNER", "admin:orgs")).toBe(false);
  });

  it("platform admin flag grants access; admin role alone has only admin perms", () => {
    expect(hasPermission("PLATFORM_ADMIN", "admin:orgs")).toBe(true);
    expect(hasPermission("PLATFORM_ADMIN", "vehicle:create")).toBe(false);
    expect(hasPermission("SALESPERSON", "anything" as never, true)).toBe(true);
  });

  it("assertPermission throws FORBIDDEN-coded error", () => {
    expect(() => assertPermission("SALESPERSON", "org:update")).toThrowError(/Missing permission/);
    try {
      assertPermission("SALESPERSON", "org:update");
    } catch (e) {
      expect((e as { code: string }).code).toBe("FORBIDDEN");
    }
  });

  it("role assignment is bounded by actor role", () => {
    expect(assignableRoles("ORG_OWNER")).toContain("ORG_OWNER");
    expect(assignableRoles("ORG_MANAGER")).not.toContain("ORG_OWNER");
    expect(assignableRoles("SALESPERSON")).toHaveLength(0);
  });
});
