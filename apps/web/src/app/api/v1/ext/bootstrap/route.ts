import { orgSettings, prisma } from "@lotpilot/db";
import { handler, json, requireApiToken } from "@/server/api";

/** Extension bootstrap: identity, org, settings, and pending action counts. */
export const GET = handler(async (req) => {
  const ctx = await requireApiToken(req);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
  const [pendingDelists, activeListings, unreadNotifications] = await Promise.all([
    prisma.listing.count({ where: { userId: ctx.user.id, status: "DELIST_REQUESTED" } }),
    prisma.listing.count({ where: { userId: ctx.user.id, status: "POSTED" } }),
    prisma.notification.count({ where: { userId: ctx.user.id, readAt: null } }),
  ]);
  return json({
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, role: ctx.role },
    organization: {
      id: org.id,
      name: org.name,
      phone: org.phone,
      settings: orgSettings(org.settings),
    },
    counts: { pendingDelists, activeListings, unreadNotifications },
  });
});
