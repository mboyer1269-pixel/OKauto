import { prisma } from "@lotpilot/db";
import { handler, json, requireOrgRole } from "@/server/api";

type Ctx = { params: Promise<{ orgId: string }> };

/**
 * Per-salesperson listing performance: total/active/delisted counts,
 * average time from listing creation to posted, and last activity.
 */
export const GET = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  await requireOrgRole(req, orgId, "MANAGER");

  const members = await prisma.membership.findMany({
    where: { organizationId: orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const listings = await prisma.listing.findMany({
    where: { organizationId: orgId },
    select: { userId: true, status: true, createdAt: true, postedAt: true, delistedAt: true },
  });

  const rows = members.map((m) => {
    const mine = listings.filter((l) => l.userId === m.userId);
    const posted = mine.filter((l) => l.postedAt != null);
    const timesToPostMs = posted
      .map((l) => (l.postedAt ? l.postedAt.getTime() - l.createdAt.getTime() : null))
      .filter((t): t is number => t != null && t >= 0);
    const lastActivity = mine.reduce<Date | null>((acc, l) => {
      const latest = [l.createdAt, l.postedAt, l.delistedAt].filter((d): d is Date => d != null);
      const max = latest.length ? new Date(Math.max(...latest.map((d) => d.getTime()))) : null;
      return !acc || (max && max > acc) ? max : acc;
    }, null);
    return {
      user: m.user,
      role: m.role,
      totals: {
        all: mine.length,
        active: mine.filter((l) => l.status === "POSTED").length,
        prepared: mine.filter((l) => l.status === "PREPARED" || l.status === "DRAFT").length,
        pendingDelist: mine.filter((l) => l.status === "DELIST_REQUESTED").length,
        delisted: mine.filter((l) => l.status === "DELISTED").length,
        postedLast30: posted.filter((l) => l.postedAt! > new Date(Date.now() - 30 * 24 * 3600 * 1000)).length,
      },
      avgTimeToPostMinutes:
        timesToPostMs.length > 0
          ? Math.round(timesToPostMs.reduce((a, b) => a + b, 0) / timesToPostMs.length / 60_000)
          : null,
      lastActivityAt: lastActivity,
    };
  });

  rows.sort((a, b) => b.totals.active - a.totals.active);
  return json({ salespeople: rows });
});
