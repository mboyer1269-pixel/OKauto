/** Auth helpers for React Server Components (cookie access via next/headers). */
import { roleAtLeast, type OrgRole } from "@lotpilot/core";
import { prisma, type Membership, type Organization, type User } from "@lotpilot/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
}

export async function requireSessionUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export interface OrgPageContext {
  user: User;
  org: Organization;
  role: OrgRole;
}

export async function requireOrgPage(orgId: string, minimumRole: OrgRole = "SALESPERSON"): Promise<OrgPageContext> {
  const user = await requireSessionUser();
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) redirect("/");
  if (user.platformRole === "ADMIN") return { user, org, role: "OWNER" };
  const membership: Membership | null = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
  });
  if (!membership) redirect("/");
  if (!roleAtLeast(membership.role, minimumRole)) redirect(`/o/${orgId}`);
  return { user, org, role: membership.role };
}
